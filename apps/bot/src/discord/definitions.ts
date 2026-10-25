import { DICTIONARY_LENGTH } from "@voiloid/shared"
import { InteractionContextType, Locale, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

import { en } from "../i18n/en"
import { ja } from "../i18n/ja"

type CommandKey = keyof typeof ja.commands

/** 説明は既定を英語にし、日本語の Discord では日本語で表示する */
const describe = <T extends { setDescription(d: string): T; setDescriptionLocalizations(l: object): T }>(
  builder: T,
  key: CommandKey,
): T => builder.setDescription(en.commands[key]).setDescriptionLocalizations({ [Locale.Japanese]: ja.commands[key] })

const command = (name: string, key: CommandKey) =>
  describe(new SlashCommandBuilder().setName(name), key).setContexts(InteractionContextType.Guild)

/** スラッシュコマンドの定義（変更したら npm run deploy-commands で登録し直す） */
export const commandDefinitions = [
  command("join", "join"),
  command("leave", "leave"),
  command("skip", "skip"),
  command("voice", "voice"),
  command("speaker", "speaker"),
  command("dict", "dict")
    // 既定ではサーバー管理者のみ（サーバーの「連携サービス」設定で変更できる）
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      describe(s.setName("add"), "dictAdd")
        .addStringOption((o) =>
          describe(o.setName("word"), "optionWord").setRequired(true).setMaxLength(DICTIONARY_LENGTH.word.max),
        )
        .addStringOption((o) =>
          describe(o.setName("reading"), "optionReading").setRequired(true).setMaxLength(DICTIONARY_LENGTH.reading.max),
        ),
    )
    .addSubcommand((s) =>
      describe(s.setName("remove"), "dictRemove").addStringOption((o) =>
        describe(o.setName("word"), "optionWord").setRequired(true).setAutocomplete(true),
      ),
    )
    .addSubcommand((s) => describe(s.setName("list"), "dictList")),
].map((c) => c.toJSON())
