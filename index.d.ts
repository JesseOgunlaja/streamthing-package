type ServerStreamConfig = {
  id: string;
  region: string;
  channel: string;
  password: string;
  encryptionKey: string;
  receiving?: boolean;
};

type ServerStreamReturn = {
  send: (event: string, msg: string) => Promise<void>;
  receive?: (event: string, callback: (data: unknown) => unknown) => void;
  disconnect?: () => void;
};

export function createServerStream(
  config: ServerStreamConfig
): ServerStreamReturn {}

type ClientStreamConfig = {
  id: string;
  region: string;
  channel: string;
  password: string;
  encryptionKey: string;
};

type ClientStreamReturn = {
  receive: (event: string, callback: (data: unknown) => unknown) => void;
  disconnect: () => void;
};

export function createClientStream(
  config: ClientStreamConfig
): ClientStreamReturn {}
