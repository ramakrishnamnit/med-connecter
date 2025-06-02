const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

// Initialize AWS clients
const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey
  }
});

const sesClient = new SESClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey
  }
});

const snsClient = new SNSClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey
  }
});

const sqsClient = new SQSClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey
  }
});

class AWSService {
  static async uploadToS3(buffer, filename, mimetype) {
    try {
      const command = new PutObjectCommand({
        Bucket: config.aws.s3.bucket,
        Key: `profile-pictures/${Date.now()}-${filename}`,
        Body: buffer,
        ContentType: mimetype,
        ACL: 'public-read'
      });

      const result = await s3Client.send(command);
      return `https://${config.aws.s3.bucket}.s3.amazonaws.com/profile-pictures/${Date.now()}-${filename}`;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error('Failed to upload file to S3');
    }
  }

  static async deleteFromS3(url) {
    try {
      const key = url.split('/').pop();
      const command = new DeleteObjectCommand({
        Bucket: config.aws.s3.bucket,
        Key: `profile-pictures/${key}`
      });

      await s3Client.send(command);
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error('Failed to delete file from S3');
    }
  }

  static async sendEmail(to, subject, htmlBody, textBody) {
    try {
      const command = new SendEmailCommand({
        Destination: {
          ToAddresses: [to]
        },
        Message: {
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: htmlBody
            },
            Text: {
              Charset: 'UTF-8',
              Data: textBody
            }
          },
          Subject: {
            Charset: 'UTF-8',
            Data: subject
          }
        },
        Source: config.email.from
      });

      await sesClient.send(command);
    } catch (error) {
      console.error('SES error:', error);
      throw new Error('Failed to send email');
    }
  }

  static async sendSMS(phoneNumber, message) {
    try {
      const command = new PublishCommand({
        Message: message,
        PhoneNumber: phoneNumber
      });

      await snsClient.send(command);
    } catch (error) {
      console.error('SNS error:', error);
      throw new Error('Failed to send SMS');
    }
  }

  static async queueJob(queueUrl, payload) {
    try {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(payload)
      });

      await sqsClient.send(command);
    } catch (error) {
      console.error('SQS error:', error);
      throw new Error('Failed to queue job');
    }
  }
}

module.exports = AWSService;
