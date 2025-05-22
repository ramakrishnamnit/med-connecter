
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// VideoSession represents a video consultation session
type VideoSession struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	AppointmentID primitive.ObjectID `bson:"appointmentId" json:"appointmentId"`
	PatientID     primitive.ObjectID `bson:"patientId" json:"patientId"`
	DoctorID      primitive.ObjectID `bson:"doctorId" json:"doctorId"`
	Status        string             `bson:"status" json:"status"` // scheduled, ongoing, completed, cancelled
	SessionToken  string             `bson:"sessionToken" json:"sessionToken"`
	SessionURL    string             `bson:"sessionUrl" json:"sessionUrl"`
	Provider      string             `bson:"provider" json:"provider"` // twilio, webrtc
	StartTime     time.Time          `bson:"startTime" json:"startTime"`
	EndTime       time.Time          `bson:"endTime" json:"endTime"`
	Duration      int                `bson:"duration" json:"duration"` // in seconds
	CreatedAt     time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// VideoSessionRequest represents a request to create a video session
type VideoSessionRequest struct {
	AppointmentID string `json:"appointmentId"`
}

// VideoSessionResponse represents the response for a video session
type VideoSessionResponse struct {
	ID            primitive.ObjectID `json:"id"`
	AppointmentID primitive.ObjectID `json:"appointmentId"`
	SessionToken  string             `json:"sessionToken"`
	SessionURL    string             `json:"sessionUrl"`
	PatientName   string             `json:"patientName"`
	DoctorName    string             `json:"doctorName"`
	StartTime     time.Time          `json:"startTime"`
}
