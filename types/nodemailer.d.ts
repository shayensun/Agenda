declare module 'nodemailer' {
  type MailOptions = {
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
  };

  type TransportOptions = {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: {
      user?: string;
      pass?: string;
    };
  };

  type Transporter = {
    sendMail(options: MailOptions): Promise<unknown>;
  };

  const nodemailer: {
    createTransport(options: TransportOptions): Transporter;
  };

  export default nodemailer;
}
