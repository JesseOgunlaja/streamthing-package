type CreateTokenConfig = {
  channel: string;
  password: string;
};

export async function createToken(config: CreateTokenConfig): Promise<string>;

type ClientStream = {
  receive(event: string, callback: (data: string) => unknown): void;
  disconnect(): void;
};

type CreateClientStreamConfig = {
  region: string;
  id: string;
  token: string;
};

export function createClientStream(
  config: CreateClientStreamConfig
): ClientStream {}

type ServerStreamConfig = {
  id: string;
  region: string;
  channel: string;
  password: string;
};

type ServerStream = {
  send(event: string, msg: string): Promise<void>;
};

export function createServerStream(config: ServerStreamConfig): ServerStream {}
