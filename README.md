# Pulumi EKS Web App 🚀

This repository contains an AWS EKS (Kubernetes) deployment using **Pulumi**. The web application is deployed inside Kubernetes and dynamically displays a configurable message.

## 🛠️ Tech Stack
- **Pulumi** (Infrastructure as Code)
- **AWS EKS** (Managed Kubernetes)
- **Kubernetes** (App Deployment)
- **Docker** (Containerized App)
- **AWS ECR** (Image Storage)

## 🎯 Features
✅ Deploys a **Kubernetes Cluster** on AWS EKS  
✅ Uses a **configurable Pulumi variable (`webMessage`)**  
✅ Exposes the app via an **AWS LoadBalancer**  
✅ Runs a **containerized web app** in Kubernetes  

## 📂 Project Structure
📦 pulumi-eks-webapp 
├── index.ts 
# Pulumi IaC Code 
├── Pulumi.yaml 
# Pulumi Project Configuration 
├── package.json 
# Node.js Dependencies 
├── Dockerfile # Web App Docker Build 
├── .gitignore 
# Excluded Files 
└── README.md 
# Project Documentation


## 🚀 Deployment Instructions

### **1️⃣ Set Up Pulumi Config**
```sh
pulumi config set webMessage "Hello from Pulumi!"

**Deploy to AWS**
pulumi up

**Get the LoadBalancer URL**
kubectl get svc -n web-app

**Test the Web App**
curl http://<EXTERNAL-IP>

Expected Output:
<h1>Web App Message: Hello from Fatema!</h1>

