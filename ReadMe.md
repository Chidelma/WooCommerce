# Pulumi Infrastructure Deployment

## Requirements

### Local Requirements
- Pulumi CLI 
- Node.js
- AWS CLI 

### Cloud Requirements
- AWS account credentials
- Access to the AWS resources (VPC, EC2, ECS, IAM, etc.)

## AWS Permissions

Make sure the AWS IAM user or role used for deployment has the following permissions:
- AWSManagedPolicyAmazonECS_FullAccess
- AWSManagedPolicyAmazonEC2_FullAccess
- AWSManagedPolicyAmazonECSTaskExecutionRolePolicy
- AWSManagedPolicyAmazonVPCFullAccess
- AWSManagedPolicyElasticLoadBalancingFullAccess
- AmazonRDSFullAccess

### So what does the diagram mean?

The given Pulumi code provisions an infrastructure on AWS using the AWS CDK (Cloud Development Kit) for deploying a web application on ECS (Elastic Container Service) with Fargate launch type. Here's a summary of what the code does:

1. Creates a VPC (Virtual Private Cloud) with a single NAT gateway.
2. Creates an ECS cluster to manage the containerized applications.
3. Creates a security group that allows incoming TCP traffic on port 80 (HTTP) from any IP address and allows all outgoing traffic.
4. Creates an Application Load Balancer (ALB) that acts as a frontend for distributing traffic to the ECS containers.
5. Creates a target group for routing requests to the ECS containers.
6. Creates a listener on the ALB that forwards incoming HTTP traffic to the target group.
7. Creates an IAM role that allows ECS tasks to assume the role for performing certain actions.
8. Attaches the `AmazonECSTaskExecutionRolePolicy` to the IAM role, which grants permissions required by ECS tasks.
9. Creates ECR (Elastic Container Registry) repositories for storing Docker images for the web and API components.
10. Builds Docker images from the Dockerfiles located in the `infra-web` and `infra-api` directories and stores them in the ECR repositories.
11. Defines a Fargate task definition for the ECS service, specifying the container definitions and resource allocations (memory, CPU).
12. Creates an ECS service that manages the desired count of Fargate tasks, associates the task definition, and configures network settings and load balancer.
13. Exports the URL of the ALB as an output for accessing the web application.
14. Creates a RDS instance to host Database

In summary, this Pulumi code sets up a fully managed ECS environment with an ALB, networking configuration, IAM roles, ECR repositories, and deploys containerized web and API components using Fargate launch type.

## Instructions

### 1. Clone the repository

`git clone https://github.com/Chidelma/WooCommerce.git`

### 2. Install dependencies

`cd <folder> && npm i`

### 3. Configure AWS credentials

Make sure your AWS credentials are properly configured. You can set them using the AWS CLI or by setting the environment variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

### 4. Set up the Pulumi stack

`pulumi stack init`

### 5. Configure the Pulumi stack

`pulumi config set aws:region <your-aws-region>`

### 6. Deploy the infrastructure

`pulumi up`

### 7. Access the application

After the deployment is complete, you can access the application using the provider Pulumni output: `http://<load-balancer-dns-name>`

### 8. Clean up

To delete the deployed infrastructure and resources, run:

`pulumi destroy`

Note: This will destroy all resources created by the Pulumi stack.
