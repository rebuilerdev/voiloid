"use client"

import { RouteError, type RouteErrorProps } from "@/components/common/route-error"

export default function Error(props: RouteErrorProps) {
  return <RouteError {...props} resource="servers" header="servers" />
}
