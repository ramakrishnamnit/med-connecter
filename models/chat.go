
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Chat represents a chat conversation
type Chat struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	AppointmentID primitive.ObjectID `bson:"appointmentId" json:"appointmentId"`
	PatientID    primitive.ObjectID `bson:"patientId" json:"patientId"`
	DoctorID     primitive.ObjectID `bson:"doctorId" json:"doctorId"`
	Messages     []Message          `bson:"messages" json:"messages"`
	CreatedAt    time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt    time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// Message represents a single chat message
type Message struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	SenderID  primitive.ObjectID `bson:"senderId" json:"senderId"`
	Content   string             `bson:"content" json:"content"`
	Type      string             `bson:"type" json:"type"` // text, image, file
	Timestamp time.Time          `bson:"timestamp" json:"timestamp"`
}

// ChatMessageRequest represents a request to send a chat message
type ChatMessageRequest struct {
	Content string `json:"content"`
	Type    string `json:"type"` // text, image, file
}

// ChatResponse represents the response for a chat conversation
type ChatResponse struct {
	ID           primitive.ObjectID `json:"id"`
	AppointmentID primitive.ObjectID `json:"appointmentId"`
	PatientID    primitive.ObjectID `json:"patientId"`
	DoctorID     primitive.ObjectID `json:"doctorId"`
	PatientName  string             `json:"patientName"`
	DoctorName   string             `json:"doctorName"`
	Messages     []MessageResponse  `json:"messages"`
	CreatedAt    time.Time          `json:"createdAt"`
}

// MessageResponse represents a message in a chat response
type MessageResponse struct {
	ID        primitive.ObjectID `json:"id"`
	SenderID  primitive.ObjectID `json:"senderId"`
	SenderName string             `json:"senderName"`
	Content   string             `json:"content"`
	Type      string             `json:"type"`
	Timestamp time.Time          `json:"timestamp"`
}
