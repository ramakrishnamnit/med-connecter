
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Payment represents a payment record
type Payment struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	AppointmentID primitive.ObjectID `bson:"appointmentId" json:"appointmentId"`
	PatientID     primitive.ObjectID `bson:"patientId" json:"patientId"`
	DoctorID      primitive.ObjectID `bson:"doctorId" json:"doctorId"`
	Amount        float64            `bson:"amount" json:"amount"`
	Currency      string             `bson:"currency" json:"currency"`
	Status        string             `bson:"status" json:"status"` // pending, successful, failed
	Method        string             `bson:"method" json:"method"` // ideal, creditcard, etc.
	Provider      string             `bson:"provider" json:"provider"` // mollie, stripe
	ProviderID    string             `bson:"providerId" json:"providerId"` // Payment ID from provider
	Metadata      map[string]string  `bson:"metadata" json:"metadata"`     // Additional payment data
	CreatedAt     time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// PaymentInitiateRequest represents a request to initiate payment
type PaymentInitiateRequest struct {
	AppointmentID string  `json:"appointmentId"`
	Amount        float64 `json:"amount"`
	Method        string  `json:"method"`
}

// PaymentInitiateResponse represents the response for a payment initiation
type PaymentInitiateResponse struct {
	PaymentID   string `json:"paymentId"`
	RedirectURL string `json:"redirectUrl"` // URL to redirect user to complete payment
}

// PaymentCallback represents payment provider callback data
type PaymentCallback struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}
