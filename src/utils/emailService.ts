import { sendEmail, emailTemplates } from '../config/nodemailer.js';
import { logger } from '../config/logger.js';

// Email service wrapper with error handling
export class EmailService {
  // Send welcome email
  static async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    try {
      const result = await sendEmail(email, emailTemplates.welcome(name));
      return result.success;
    } catch (error) {
      logger.error(`Welcome email failed for ${email}: ${error}`);
      return false;
    }
  }

  // Send ride booked email
  static async sendRideBookedEmail(
    email: string,
    name: string,
    rideDetails: { pickup: string; destination: string; fare: number }
  ): Promise<boolean> {
    try {
      const result = await sendEmail(email, emailTemplates.rideBooked(name, rideDetails));
      return result.success;
    } catch (error) {
      logger.error(`Ride booked email failed for ${email}: ${error}`);
      return false;
    }
  }

  // Send driver verified email
  static async sendDriverVerifiedEmail(email: string, name: string): Promise<boolean> {
    try {
      const result = await sendEmail(email, emailTemplates.driverVerified(name));
      return result.success;
    } catch (error) {
      logger.error(`Driver verified email failed for ${email}: ${error}`);
      return false;
    }
  }

  // Send password reset email
  static async sendPasswordResetEmail(email: string, name: string, resetLink: string): Promise<boolean> {
    try {
      const result = await sendEmail(email, emailTemplates.passwordReset(name, resetLink));
      return result.success;
    } catch (error) {
      logger.error(`Password reset email failed for ${email}: ${error}`);
      return false;
    }
  }

  // Send ride completed email
  static async sendRideCompletedEmail(
    email: string,
    name: string,
    rideDetails: { pickup: string; destination: string; fare: number; rating?: number }
  ): Promise<boolean> {
    try {
      const result = await sendEmail(email, emailTemplates.rideCompleted(name, rideDetails));
      return result.success;
    } catch (error) {
      logger.error(`Ride completed email failed for ${email}: ${error}`);
      return false;
    }
  }

  // Send custom email
  static async sendCustomEmail(
    email: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    try {
      const result = await sendEmail(email, { subject, html });
      return result.success;
    } catch (error) {
      logger.error(`Custom email failed for ${email}: ${error}`);
      return false;
    }
  }
}

export default EmailService;
