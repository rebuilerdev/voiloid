import { DICTIONARY_LENGTH } from "@voiloid/shared"
import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

/** スラッシュコマンドの定義（変更したら npm run deploy-commands で登録し直す） */
export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("ボイスチャンネルに参加し、このチャンネルの発言を読み上げます")
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("読み上げを終了してボイスチャンネルから退出します")
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("読み上げ中・待機中のメッセージをスキップします")
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName("voice")
    .setDescription("あなたの読み上げ音声（マイボイス）を確認します")
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName("dict")
    .setDescription("このサーバーの読み方辞書")
    .setContexts(InteractionContextType.Guild)
    // 既定ではサーバー管理者のみ（サーバーの「連携サービス」設定で変更できる）
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("単語の読み方を登録します（既にあれば上書き）")
        .addStringOption((o) =>
          o.setName("word").setDescription("単語").setRequired(true).setMaxLength(DICTIONARY_LENGTH.word.max),
        )
        .addStringOption((o) =>
          o.setName("reading").setDescription("読み方").setRequired(true).setMaxLength(DICTIONARY_LENGTH.reading.max),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("登録した単語を削除します")
        .addStringOption((o) => o.setName("word").setDescription("単語").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("登録されている単語の一覧を表示します")),
].map((c) => c.toJSON())
