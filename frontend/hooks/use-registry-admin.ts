"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { CONTRACTS, REGISTRY_ABI, isDeployed } from "@/lib/contracts";
import { maskFromCategories, type CategoryCode } from "@/lib/types";

export function useRegistryAdmin() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: owner } = useReadContract({
    address: CONTRACTS.agentRegistry,
    abi: REGISTRY_ABI,
    functionName: "owner",
    query: { enabled: isDeployed },
  });

  const isOwner = Boolean(
    address && owner && address.toLowerCase() === (owner as string).toLowerCase()
  );

  const register = useCallback(
    async (input: {
      agent: `0x${string}`;
      name: string;
      categories: CategoryCode[];
      endpoint: string;
      description: string;
      website: string;
    }) => {
      const hash = await writeContractAsync({
        address: CONTRACTS.agentRegistry,
        abi: REGISTRY_ABI,
        functionName: "registerAgent",
        args: [
          input.agent,
          input.name,
          maskFromCategories(input.categories),
          input.endpoint,
          input.description,
          input.website,
        ],
      });
      return hash;
    },
    [writeContractAsync]
  );

  const setActive = useCallback(
    async (agent: `0x${string}`, active: boolean) => {
      return writeContractAsync({
        address: CONTRACTS.agentRegistry,
        abi: REGISTRY_ABI,
        functionName: "setActive",
        args: [agent, active],
      });
    },
    [writeContractAsync]
  );

  return useMemo(
    () => ({ address, owner: owner as `0x${string}` | undefined, isOwner, isPending, register, setActive }),
    [address, isOwner, isPending, owner, register, setActive]
  );
}
