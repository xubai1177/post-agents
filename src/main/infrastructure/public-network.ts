import { BlockList } from 'node:net'

const blocked = new BlockList()
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(address, prefix, 'ipv4')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
export function publicAddress(address: string, family: number): boolean {
  if (family === 4) return !blocked.check(address, 'ipv4')
  if (family !== 6 || address.toLowerCase().includes('::ffff:')) return false
  const first = parseInt(address.split(':')[0], 16)
  return first >= 0x2000 && first <= 0x3fff && !blocked.check(address, 'ipv6')
}
