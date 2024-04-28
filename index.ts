import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from '@pulumi/awsx'

const project_name = 'Woo-Commerce'

const path = '/WeatherForecast'

const tags = { 
  Name: `${project_name}`
}

async function getValue<T>(output: pulumi.Output<T>) {

  return new Promise((resolve: (value: T) => void) => {
      output.apply(out => {
          resolve(out)
      })
  })
}

(async () => {

  // Create a repository to store image for web
  const repoWeb = new awsx.ecr.Repository(`${project_name}-web`, {
    tags: tags
  })

  // Create a repository to store image for api
  const repoApi = new awsx.ecr.Repository(`${project_name}-api`, {
      tags: tags
  })

  // Build an image from Dockerfile stored in system and store in repo
  const imageWeb = new awsx.ecr.Image(`${project_name}-web`, {
    repositoryUrl: repoWeb.url,
    path: './infra-web',
  })

  // Build an image from Dockerfile stored in system and store in repo
  const imageApi = new awsx.ecr.Image(`${project_name}-api`, {
      repositoryUrl: repoApi.url,
      path: './infra-api'
  })
  
  const vpc = new awsx.ec2.Vpc(`${project_name}-vpc`, {
    cidrBlock: "10.0.0.0/20",
    tags: tags
  });

  const sg_web = new aws.ec2.SecurityGroup(`${project_name}-sg-web`, {
      vpcId: vpc.vpcId,
      ingress: [
        {
          fromPort: 5000,
          toPort: 5000,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"]
        },
        {
          fromPort: 80,
          toPort: 80,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"]
        }
      ],
      egress: [{
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"]
      }],
      tags: tags
  });

  const sg_api = new aws.ec2.SecurityGroup(`${project_name}-sg-api`, {
    vpcId: vpc.vpcId,
    ingress: [
      {
        fromPort: 5000,
        toPort: 5000,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"]
      },
      {
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"]
      }
    ],
    egress: [{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"]
    }],
    tags: tags
  })

  const sg_rds = new aws.ec2.SecurityGroup(`${project_name}-sg-rds`, {
    vpcId: vpc.vpcId,
    ingress: [
      {
        fromPort: 1433,
        toPort: 1433,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"]
      }
    ],
    egress: [{
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"]
    }],
    tags: tags
  })

  // Create an ECS cluster
  const cluster = new aws.ecs.Cluster(`${project_name}-cluster`, {
    tags: tags
  })

  const web_lb = new awsx.lb.ApplicationLoadBalancer(`${project_name}-web-lb`, {
    tags: tags,
    securityGroups: [await getValue(sg_web.id)],
    subnetIds: vpc.publicSubnetIds
  })

  const api_lb = new awsx.lb.ApplicationLoadBalancer(`${project_name}-api-lb`, {
    tags: tags,
    internal: true,
    securityGroups: [await getValue(sg_api.id)],
    subnetIds: vpc.privateSubnetIds,
    defaultTargetGroup: {
      healthCheck: {
        path: path
      }
    }
  })

  const rds_instance = new aws.rds.Instance(`${project_name.toLowerCase()}-rds`, {
    engine: "mysql",
    instanceClass: "db.t3.micro",
    allocatedStorage: 20,
    vpcSecurityGroupIds: [await getValue(sg_rds.id)],
    multiAz: true,
    publiclyAccessible: false,
    storageType: "gp2",
    username: 'sa',
    password: process.env.RDS_PASSWORD,
    dbSubnetGroupName: sg_rds.name,
    tags: tags
  })

  const api_td = new awsx.ecs.FargateTaskDefinition(`${project_name}-api-td`, {
    tags: tags,
    containers: {
      infraapi: {
        image: imageApi.imageUri,
        memory: 128,
        cpu: 512,
        environment: [{
          name: 'ConnectionString',
          value: rds_instance.address
        }],
        portMappings: [
          {
            containerPort: 5000,
            hostPort: 5000
          }
        ],
        name: "woo-api"
      }
    }
  })

  const web_td = new awsx.ecs.FargateTaskDefinition(`${project_name}-web-td`, {
    tags: tags,
    containers: {
      infraweb: {
        image: imageWeb.imageUri,
        memory: 128,
        cpu: 512,
        environment: [{
          name: 'ApiAddress',
          value: pulumi.interpolate`http://${api_lb.loadBalancer.dnsName}${path}`
        }],
        portMappings: [
          {
            containerPort: 5000,
            hostPort: 5000
          }
        ],
        name: "woo-web"
      }
    }
  })

  // Lets use a serverless service (Fargate) from Elastic Container Service
  const web_srv = new awsx.ecs.FargateService(`${project_name}-web-srv`, {
    networkConfiguration: {
      assignPublicIp: true,
      subnets: vpc.publicSubnetIds,
      securityGroups: [await getValue(sg_web.id)]
    },
    cluster: cluster.arn,
    desiredCount: 2,
    taskDefinition: web_td.taskDefinition.arn,
    tags: tags,
    loadBalancers: [{
      targetGroupArn: web_lb.defaultTargetGroup.arn,
      containerName: 'infraweb',
      containerPort: 5000
    }]
  })

  const api_srv = new awsx.ecs.FargateService(`${project_name}-api-srv`, {
    networkConfiguration: {
      subnets: vpc.privateSubnetIds,
      securityGroups: [await getValue(sg_api.id)],
      assignPublicIp: false
    },
    cluster: cluster.arn,
    desiredCount: 2,
    taskDefinition: api_td.taskDefinition.arn,
    tags: tags,
    loadBalancers: [{
      targetGroupArn: api_lb.defaultTargetGroup.arn,
      containerName: 'infraapi',
      containerPort: 5000
    }]
  })

  const lb_acl = new aws.wafv2.WebAcl(`${project_name}-acl`, {
    scope: "REGIONAL",
    defaultAction: {
      allow: {}
    },
    visibilityConfig: {
      cloudwatchMetricsEnabled: false,
      metricName: `${project_name}-acl-metric`,
      sampledRequestsEnabled: false
    }
  })

  const lb_assoc = new aws.wafv2.WebAclAssociation(`${project_name}-assoc`, {
    resourceArn: web_lb.loadBalancer.arn,
    webAclArn: lb_acl.arn
  })

  //export const ecsTaskUrl = pulumi.interpolate`http://${web_lb.loadBalancer.dnsName}`
})()