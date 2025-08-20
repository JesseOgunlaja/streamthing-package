type CreateTokenConfig = {
  id: string;
  channel: string;
  password: string;
  socketId: string;
};
export async function createToken(config: CreateTokenConfig): Promise<string>;

type ClientStream = {
  id: string;
  authenticate: (token: string) => void;
  receive: (event: string, callback: (data: string) => unknown) => void;
  send: (event: string, msg: string) => Promise<void>;
  disconnect: () => void;
};

export function createClientStream(region: string): Promise<ClientStream> {}

type ServerStreamConfig = {
  id: string;
  region: string;
  channel: string;
  password: string;
};

type ServerStream = {
  send: (event: string, msg: string) => Promise<void>;
};

export function createServerStream(config: ServerStreamConfig): ServerStream {}
