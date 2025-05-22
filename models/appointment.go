
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Appointment represents a doctor appointment
type Appointment struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	PatientID      primitive.ObjectID `bson:"patientId" json:"patientId"`
	DoctorID       primitive.ObjectID `bson:"doctorId" json:"doctorId"`
	ScheduledAt    time.Time          `bson:"scheduledAt" json:"scheduledAt"`
	EndTime        time.Time          `bson:"endTime" json:"endTime"`
	Duration       int                `bson:"duration" json:"duration"` // in minutes
	Status         string             `bson:"status" json:"status"`     // pending, confirmed, cancelled, completed
	PaymentStatus  string             `bson:"paymentStatus" json:"paymentStatus"` // pending, paid, failed
	Mode           string             `bson:"mode" json:"mode"`                   // video, in-person
	IsSecondOpinion bool               `bson:"isSecondOpinion" json:"isSecondOpinion"`
	Notes          string             `bson:"notes" json:"notes"`
	CreatedAt      time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// AppointmentRequest represents a new appointment request
type AppointmentRequest struct {
	DoctorID        string    `json:"doctorId"`
	ScheduledAt     time.Time `json:"scheduledAt"`
	Duration        int       `json:"duration"` // in minutes
	Mode            string    `json:"mode"`     // video, in-person
	IsSecondOpinion bool      `json:"isSecondOpinion"`
	Notes           string    `json:"notes"`
}

// AppointmentResponse is the enhanced appointment data returned to clients
type AppointmentResponse struct {
	ID                primitive.ObjectID `json:"id"`
	PatientID         primitive.ObjectID `json:"patientId"`
	DoctorID          primitive.ObjectID `json:"doctorId"`
	PatientName       string             `json:"patientName"`
	DoctorName        string             `json:"doctorName"`
	DoctorSpecialties []string           `json:"doctorSpecialties"`
	ScheduledAt       time.Time          `json:"scheduledAt"`
	EndTime           time.Time          `json:"endTime"`
	Duration          int                `json:"duration"`
	Status            string             `json:"status"`
	PaymentStatus     string             `json:"paymentStatus"`
	Mode              string             `json:"mode"`
	IsSecondOpinion   bool               `json:"isSecondOpinion"`
	Notes             string             `json:"notes"`
	Amount            float64            `json:"amount"`
	CreatedAt         time.Time          `json:"createdAt"`
}
