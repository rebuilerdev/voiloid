import { EmbedBuilder, MessageFlags, type InteractionReplyOptions } from "discord.js"

import type { Reply } from "../core/commands"

const COLORS = { success: 0x57f287, info: 0x5865f2, error: 0xed4245 } as const

export function toReplyOptions(reply: Reply): InteractionReplyOptions & { flags?: MessageFlags.Ephemeral } {
  const embed = new EmbedBuilder().setColor(COLORS[reply.tone]).setDescription(reply.description)
  if (reply.title) embed.setTitle(reply.title)
  if (reply.fields) embed.addFields(reply.fields.map((f) => ({ ...f, inline: true })))
  return reply.ephemeral ? { embeds: [embed], flags: MessageFlags.Ephemeral } : { embeds: [embed] }
}
