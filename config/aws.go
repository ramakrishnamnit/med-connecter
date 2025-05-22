
package config

import (
	"log"
	"os"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/secretsmanager"
	"github.com/aws/aws-sdk-go/service/ses"
	"github.com/aws/aws-sdk-go/service/sns"
	"github.com/aws/aws-sdk-go/service/sqs"
)

// AWSConfig holds all AWS service clients
type AWSConfig struct {
	S3Client           *s3.S3
	SESClient          *ses.SES
	SNSClient          *sns.SNS
	SQSClient          *sqs.SQS
	SecretsManagerClient *secretsmanager.SecretsManager
}

// InitAWS initializes all AWS services
func InitAWS() (*AWSConfig, error) {
	// Create AWS session
	sess, err := createAWSSession()
	if err != nil {
		return nil, err
	}

	// Initialize AWS services
	s3Client := s3.New(sess)
	sesClient := ses.New(sess)
	snsClient := sns.New(sess)
	sqsClient := sqs.New(sess)
	secretsManagerClient := secretsmanager.New(sess)

	return &AWSConfig{
		S3Client:           s3Client,
		SESClient:          sesClient,
		SNSClient:          snsClient,
		SQSClient:          sqsClient,
		SecretsManagerClient: secretsManagerClient,
	}, nil
}

// createAWSSession creates and returns a new AWS session
func createAWSSession() (*session.Session, error) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "eu-west-1" // Default to EU (Ireland) for Netherlands proximity
	}

	// Create AWS session
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String(region),
		Credentials: credentials.NewStaticCredentials(
			os.Getenv("AWS_ACCESS_KEY_ID"),
			os.Getenv("AWS_SECRET_ACCESS_KEY"),
			"",
		),
	})
	if err != nil {
		log.Printf("Failed to create AWS session: %v", err)
		return nil, err
	}

	return sess, nil
}

// GetSecret retrieves a secret from AWS Secrets Manager
func (c *AWSConfig) GetSecret(secretName string) (string, error) {
	input := &secretsmanager.GetSecretValueInput{
		SecretId: aws.String(secretName),
	}

	result, err := c.SecretsManagerClient.GetSecretValue(input)
	if err != nil {
		return "", err
	}

	var secretString string
	if result.SecretString != nil {
		secretString = *result.SecretString
	}

	return secretString, nil
}

// UploadToS3 uploads a file to S3
func (c *AWSConfig) UploadToS3(bucket, key string, fileBytes []byte, contentType string) (string, error) {
	_, err := c.S3Client.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        aws.ReadSeekCloser(aws.NewReadSeeker(fileBytes, int64(len(fileBytes)))),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}

	return "https://" + bucket + ".s3.amazonaws.com/" + key, nil
}

// SendEmail sends an email using SES
func (c *AWSConfig) SendEmail(to, subject, htmlBody, textBody string) error {
	input := &ses.SendEmailInput{
		Destination: &ses.Destination{
			ToAddresses: []*string{aws.String(to)},
		},
		Message: &ses.Message{
			Body: &ses.Body{
				Html: &ses.Content{
					Charset: aws.String("UTF-8"),
					Data:    aws.String(htmlBody),
				},
				Text: &ses.Content{
					Charset: aws.String("UTF-8"),
					Data:    aws.String(textBody),
				},
			},
			Subject: &ses.Content{
				Charset: aws.String("UTF-8"),
				Data:    aws.String(subject),
			},
		},
		Source: aws.String(os.Getenv("SES_SENDER_EMAIL")),
	}

	_, err := c.SESClient.SendEmail(input)
	return err
}

// SendSMS sends an SMS using SNS
func (c *AWSConfig) SendSMS(phoneNumber, message string) error {
	input := &sns.PublishInput{
		Message:     aws.String(message),
		PhoneNumber: aws.String(phoneNumber),
	}

	_, err := c.SNSClient.Publish(input)
	return err
}

// SendToSQS sends a message to an SQS queue
func (c *AWSConfig) SendToSQS(queueURL, messageBody string) error {
	input := &sqs.SendMessageInput{
		QueueUrl:    aws.String(queueURL),
		MessageBody: aws.String(messageBody),
	}

	_, err := c.SQSClient.SendMessage(input)
	return err
}
