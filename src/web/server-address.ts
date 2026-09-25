import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

export type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

export function buildWebServerUrl(
  bindHost: string,
  port: number,
  interfaces: NetworkInterfaces = networkInterfaces(),
): string {
  const host = bindHost === "0.0.0.0" ? findMachineIpv4Address(interfaces) : bindHost;
  return `http://${formatUrlHost(host)}:${port}`;
}

export function findMachineIpv4Address(interfaces: NetworkInterfaces): string {
  for (const addresses of Object.values(interfaces)) {
    const address = addresses?.find((candidate) => candidate.family === "IPv4" && !candidate.internal);
    if (address) return address.address;
  }

  return "127.0.0.1";
}

function formatUrlHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}
