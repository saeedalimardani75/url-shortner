declare namespace Express {
  interface Request {
    requestId?: string;
    apiKey?: import('../../auth/entities/api-key.entity').ApiKey;
  }
}
