"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  WagmiProvider,
  cookieStorage,
  createConfig,
  createStorage,
  http,
} from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

const FUJI_RPC =
  process.env.NEXT_PUBLIC_FUJI_RPC ?? "https://api.avax-test.network/ext/bc/C/rpc";

export const wagmiConfig = createConfig({
  chains: [avalancheFuji],
  connectors: [metaMask(), injected()],
  transports: {
    [avalancheFuji.id]: http(FUJI_RPC, {
      timeout: 12_000,
      retryCount: 1,
      retryDelay: 400,
    }),
  },
  storage: createStorage({ storage: cookieStorage, key: "avatrip.wagmi" }),
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
    </QueryClientProvider>
  );
}
