import nodemailer from 'nodemailer';
import { logger } from './logger.js';

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Verify connection
transporter.verify((error, success) => {
  if (error) {
    logger.error(`Email configuration error: ${error}`);
  } else {
    logger.info('Email server is ready to send messages');
  }
});

// Email templates
export const emailTemplates = {
  welcome: (name: string) => ({
    subject: 'Welcome to Our Ride Service!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Welcome ${name}!</h2>
        <p>Thank you for registering with our ride service.</p>
        <p>You can now book rides and enjoy our services.</p>
        <div style="margin-top: 30px; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">
          <h3 style="color: #1F2937;">Getting Started:</h3>
          <ul style="color: #4B5563;">
            <li>Complete your profile</li>
            <li>Enable location access for better experience</li>
            <li>Book your first ride</li>
          </ul>
        </div>
        <p style="margin-top: 30px; color: #6B7280;">
          Best regards,<br/>
          The Ride Service Team
        </p>
      </div>
    `
  }),

  rideBooked: (name: string, rideDetails: { pickup: string; destination: string; fare: number }) => ({
    subject: 'Ride Booked Successfully',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Ride Confirmed!</h2>
        <p>Hi ${name},</p>
        <p>Your ride has been booked successfully.</p>
        <div style="margin-top: 20px; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">
          <h3 style="color: #1F2937;">Ride Details:</h3>
          <p><strong>Pickup:</strong> ${rideDetails.pickup}</p>
          <p><strong>Destination:</strong> ${rideDetails.destination}</p>
          <p><strong>Fare:</strong> ₹${rideDetails.fare}</p>
        </div>
        <p style="margin-top: 30px;">Your driver will arrive shortly. Track your ride in the app.</p>
        <p style="color: #6B7280;">
          Best regards,<br/>
          The Ride Service Team
        </p>
      </div>
    `
  }),

  driverVerified: (name: string) => ({
    subject: 'Driver Account Verified',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10B981;">Congratulations ${name}!</h2>
        <p>Your driver account has been verified and approved.</p>
        <p>You can now start accepting ride requests and earning.</p>
        <div style="margin-top: 30px; padding: 20px; background-color: #ECFDF5; border-radius: 8px; border-left: 4px solid #10B981;">
          <h3 style="color: #065F46;">Next Steps:</h3>
          <ul style="color: #047857;">
            <li>Go online to start receiving ride requests</li>
            <li>Keep your documents updated</li>
            <li>Maintain good ratings for better opportunities</li>
          </ul>
        </div>
        <p style="margin-top: 30px; color: #6B7280;">
          Happy driving!<br/>
          The Ride Service Team
        </p>
      </div>
    `
  }),

  passwordReset: (name: string, resetLink: string) => ({
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Password Reset</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password.</p>
        <div style="margin-top: 30px; text-align: center;">
          <a href="${resetLink}" style="display: inline-block; padding: 12px 30px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p style="margin-top: 30px; color: #EF4444;">
          If you didn't request this, please ignore this email.
        </p>
        <p style="color: #6B7280; font-size: 12px;">
          This link will expire in 1 hour.
        </p>
        <p style="color: #6B7280;">
          Best regards,<br/>
          The Ride Service Team
        </p>
      </div>
    `
  }),

  rideCompleted: (name: string, rideDetails: { pickup: string; destination: string; fare: number; rating?: number }) => ({
    subject: 'Ride Completed - Thank You!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Ride Completed!</h2>
        <p>Hi ${name},</p>
        <p>Thank you for riding with us.</p>
        <div style="margin-top: 20px; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">
          <h3 style="color: #1F2937;">Trip Summary:</h3>
          <p><strong>From:</strong> ${rideDetails.pickup}</p>
          <p><strong>To:</strong> ${rideDetails.destination}</p>
          <p><strong>Fare:</strong> ₹${rideDetails.fare}</p>
          ${rideDetails.rating ? `<p><strong>Your Rating:</strong> ${'⭐'.repeat(rideDetails.rating)}</p>` : ''}
        </div>
        <p style="margin-top: 30px;">We hope you had a great experience. Book your next ride soon!</p>
        <p style="color: #6B7280;">
          Best regards,<br/>
          The Ride Service Team
        </p>
      </div>
    `
  })
};

// Send email function
export const sendEmail = async (to: string, template: { subject: string; html: string }) => {
  try {
    const mailOptions = {
      from: `"Ride Service" <${process.env.EMAIL_USER}>`,
      to,
      subject: template.subject,
      html: template.html
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error}`);
    return { success: false, error };
  }
};

export default transporter;
