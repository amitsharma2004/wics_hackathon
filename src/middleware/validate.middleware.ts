import { Request, Response, NextFunction } from 'express';
import { Schema } from 'joi';
import { logger } from '../config/logger.js';

export const validate = (schema: Schema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Validation middleware called');
      const { error } = schema.validate(req.body);
      if (error) {
        logger.warn(`Validation failed: ${error.details[0].message}`);
        return res.status(400).json({ message: error.details[0].message });
      }
      logger.info('Validation passed');
      next();
    } catch (err) {
      logger.error(`Validation middleware error: ${err}`);
      return res.status(500).json({ message: 'Validation error' });
    }
  };
};
