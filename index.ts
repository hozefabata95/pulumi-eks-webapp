import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";

// Get the configurable value from Pulumi config
const config = new pulumi.Config();
const webMessage = config.require("webMessage");

// Create a VPC
const vpc = new aws.ec2.Vpc("vpc", {
    cidrBlock: "10.0.0.0/16",
    enableDnsSupport: true,
    enableDnsHostnames: true,
    tags: {
        Name: "eks-vpc",
    },
});

// Create Public Subnets
const publicSubnet1 = new aws.ec2.Subnet("publicSubnet1", {
    vpcId: vpc.id,
    cidrBlock: "10.0.1.0/24",
    mapPublicIpOnLaunch: true,
    availabilityZone: "us-east-1a",
    tags: {
        Name: "public-subnet-1",
        "kubernetes.io/role/elb": "1", // Required for LoadBalancer integration
    },
});

const publicSubnet2 = new aws.ec2.Subnet("publicSubnet2", {
    vpcId: vpc.id,
    cidrBlock: "10.0.2.0/24",
    mapPublicIpOnLaunch: true,
    availabilityZone: "us-east-1b",
    tags: {
        Name: "public-subnet-2",
        "kubernetes.io/role/elb": "1", // Required for LoadBalancer integration
    },
});

// Create an Internet Gateway
const internetGateway = new aws.ec2.InternetGateway("internetGateway", {
    vpcId: vpc.id,
    tags: {
        Name: "eks-internet-gateway",
    },
});

// Create a Route Table for Public Subnets
const publicRouteTable = new aws.ec2.RouteTable("publicRouteTable", {
    vpcId: vpc.id,
    routes: [
        {
            cidrBlock: "0.0.0.0/0",
            gatewayId: internetGateway.id,
        },
    ],
    tags: {
        Name: "public-route-table",
    },
});

// Associate Public Subnets with the Route Table
new aws.ec2.RouteTableAssociation("publicSubnet1RouteTableAssociation", {
    subnetId: publicSubnet1.id,
    routeTableId: publicRouteTable.id,
});

new aws.ec2.RouteTableAssociation("publicSubnet2RouteTableAssociation", {
    subnetId: publicSubnet2.id,
    routeTableId: publicRouteTable.id,
});

// Create an EKS IAM Role
const eksRole = new aws.iam.Role("eksRole", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "eks.amazonaws.com" }),
    tags: {
        Name: "eks-role",
    },
});

// Attach the necessary policies to the EKS role
new aws.iam.RolePolicyAttachment("eksClusterPolicyAttachment", {
    role: eksRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEKSClusterPolicy,
});

new aws.iam.RolePolicyAttachment("eksWorkerNodePolicyAttachment", {
    role: eksRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEKSWorkerNodePolicy,
});

new aws.iam.RolePolicyAttachment("eksEC2ContainerRegistryReadOnlyAttachment", {
    role: eksRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEC2ContainerRegistryReadOnly,
});

new aws.iam.RolePolicyAttachment("eksCNIPolicyAttachment", {
    role: eksRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEKS_CNI_Policy,
});

// Create an IAM Role for Worker Nodes
const nodeRole = new aws.iam.Role("nodeRole", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ec2.amazonaws.com" }),
    tags: {
        Name: "eks-node-role",
    },
});

// Attach the necessary policies to the node role
new aws.iam.RolePolicyAttachment("nodeRoleWorkerNodePolicyAttachment", {
    role: nodeRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEKSWorkerNodePolicy,
});

new aws.iam.RolePolicyAttachment("nodeRoleEC2ContainerRegistryReadOnlyAttachment", {
    role: nodeRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEC2ContainerRegistryReadOnly,
});

new aws.iam.RolePolicyAttachment("nodeRoleCNIPolicyAttachment", {
    role: nodeRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEKS_CNI_Policy,
});

// Create an EKS Cluster (disable default node group creation)
const eksCluster = new eks.Cluster("eksCluster", {
    vpcId: vpc.id,
    subnetIds: [publicSubnet1.id, publicSubnet2.id],
    skipDefaultNodeGroup: true, // Disable the default unmanaged node group
    instanceRoles: [nodeRole], // Associate the node role with the cluster
    roleMappings: [
        {
            groups: ["system:masters"],
            roleArn: eksRole.arn,
            username: "admin",
        },
    ],
    tags: {
        Name: "eks-cluster",
    },
});

// Add a ManagedNodeGroup to the EKS cluster
const nodeGroup = new eks.ManagedNodeGroup("nodeGroup", {
    cluster: eksCluster,
    instanceTypes: ["t3.medium"],
    scalingConfig: {
        desiredSize: 2,
        minSize: 1,
        maxSize: 3,
    },
    diskSize: 20,
    labels: { "nodegroup": "worker-nodes" },
    tags: {
        Environment: "dev",
        Project: "eks-web-deployer",
    },
    nodeRole: nodeRole, // ✅ FIXED: Pass full IAM Role object instead of ARN
}, { provider: eksCluster.provider });
// Create a Kubernetes Provider
const k8sProvider = new k8s.Provider("k8sProvider", {
    kubeconfig: eksCluster.kubeconfig,
});

// Create a Kubernetes Namespace
const webNamespace = new k8s.core.v1.Namespace("webNamespace", {
    metadata: { name: "web-app" },
}, { provider: k8sProvider });

// Deploy the Web Application
const webDeployment = new k8s.apps.v1.Deployment("webDeployment", {
    metadata: {
        namespace: webNamespace.metadata.name,
        name: "web-app",
    },
    spec: {
        replicas: 2,
        selector: { matchLabels: { app: "web-app" } },
        template: {
            metadata: { labels: { app: "web-app" } },
            spec: {
                containers: [{
                    name: "web-app",
                    image: "443370681697.dkr.ecr.us-east-1.amazonaws.com/custom-webapp:latest", // Replace with your ECR image
                    ports: [{ containerPort: 8080 }],
                    env: [{ name: "MESSAGE", value: webMessage }],
                    resources: {
                        requests: { memory: "64Mi", cpu: "250m" },
                        limits: { memory: "128Mi", cpu: "500m" },
                    },
                }],
            },
        },
    },
}, { provider: k8sProvider });

// Expose the Web Application using a LoadBalancer
const webService = new k8s.core.v1.Service("webService", {
    metadata: {
        namespace: webNamespace.metadata.name,
        name: "web-app-service",
    },
    spec: {
        type: "LoadBalancer",
        selector: { app: "web-app" },
        ports: [{ port: 80, targetPort: 8080 }],
    },
}, { provider: k8sProvider });

// Export the EKS cluster name, kubeconfig, and service endpoint
export const eksClusterName = eksCluster.eksCluster.name;
export const kubeconfig = eksCluster.kubeconfig;
export const webServiceEndpoint = webService.status.loadBalancer.ingress[0].hostname;