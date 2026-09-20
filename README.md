# Telegram Bot Integration by MSXD

An Obsidian plugin that connects a personal Telegram bot to your vault.

It works in two directions:

- **Incoming.** The bot receives your messages and files them into notes by rules you set.
- **Outgoing.** The bot answers commands about what is in the vault, starting with tasks that
  are due.

The plugin is built for one person, one bot and one vault. There is no server, no account and
no third party: the only host it ever talks to is `api.telegram.org`.

## Requirements

- Obsidian 1.11.0 or newer.
- Desktop only: the manifest is marked `isDesktopOnly`, and the plugin holds a long polling
  connection open while it listens.
- A bot token from [@BotFather](https://t.me/BotFather).

## Installation

The plugin is not in the community list yet, so install it by hand:

1. Download `main.js`, `manifest.json` and `styles.css` from a release.
2. Put them in `<vault>/.obsidian/plugins/telegram-bot-integration-by-msxd/`.
3. Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Setup

Everything lives in **Settings → Telegram Bot Integration by MSXD**.

1. **Bot token.** Paste the token from @BotFather and press **Check token**. The plugin asks
   Telegram who the bot is and remembers its username.
2. **Allowed chats.** Write to your bot from Telegram, press **Refresh**, then **Allow** next to
   your own chat. Nothing happens until a chat is on this list: an empty list denies everyone.
3. **Rules.** Decide where messages land. A fresh install has a single default rule that takes
   everything.
4. **Receiving.** Switch it on. The plugin now watches for messages and files them.
5. **Command hints** (optional). Press **Update commands** to register the bot's commands with
   Telegram, so the chat suggests them while you type.

## Filing messages

Rules are checked top to bottom and the first match wins. Whatever no rule claims goes to the
default rule at the bottom, which cannot be removed.

Every rule decides on its own where and how a message is written:

| Field | What it does |
| --- | --- |
| Filter | Which messages the rule claims |
| Path | Where the note goes. Ending in `.md` names the note itself, anything else is a folder |
| Media path | Folder for photos, files and voice notes |
| Note name | Used when the path points at a folder |
| Heading | Written above the message body |
| Separate messages | Puts a horizontal rule before a message added to a note that already has content |

### Filters

| Filter | Matches |
| --- | --- |
| `{{all}}` | every message |
| `{{content~text}}` | the message contains `text` |
| `{{hashtag~tag}}` | the message carries `#tag` |

### Variables

Paths, note names and headings take the same variables:

| Variable | Value |
| --- | --- |
| `{{content:30}}` | first 30 characters of the message |
| `{{chat}}`, `{{chatId}}` | chat name and id |
| `{{topic}}`, `{{topicId}}` | forum topic name and id |
| `{{messageId}}` | message id |
| `{{user}}`, `{{userId}}` | sender username (or id when there is none) and id |
| `{{messageDate:YYYY-MM-DD}}` | date in the given format |
| `{{messageTime:HH:mm}}` | time in the given format |
| `{{hashtag:[0]}}` | first hashtag, without the `#` |

Date formats are [moment.js](https://momentjs.com/docs/#/displaying/format/) formats. The rule
editor shows a live preview of the path against a sample message, so there is no need to guess.

A path that already exists is appended to rather than overwritten, which is what makes
`Journal/{{messageDate:YYYY-MM}}.md` collect a month of messages in one note. Attachments are
downloaded into the media folder and embedded in the note; a file Telegram refuses to hand over
is skipped with a notice, and the text of the message is still saved.

## Commands

Commands work in an allowed chat while receiving is on. A message that is not a command the
plugin knows stays a message and is filed as a note, so nothing is swallowed by a typo.

| Command | Answers with |
| --- | --- |
| `/tasks` | tasks due today |
| `/tasks 3` | tasks due today and the next two days |
| `/tasks 3 work` | the same, limited to the topic `work` |
| `/tasks2`, `/tasks5`, `/tasks7` | today plus 2, 5 or 7 days |
| `/topics` | the topic codes and where they point |

The number in a command name is **days ahead of today**, so `/tasks2` is the same three days as
`/tasks 3`. Any number works when typed by hand: `/tasks4` covers today plus four days.

### Topics

A topic is a code word for one place in the vault. Add one under **Commands**: a code, and a
path to either a folder (every note inside it is searched) or a single note. Without a topic a
command searches the whole vault.

A topic can also answer to commands of its own. Switch **commands** on in its row and the bot
takes `/work`, `/work2`, `/work5` and `/work7` the same way it takes `/tasks`. This needs a code
Telegram accepts as a command name — lowercase letters, digits and `_` — and the names `tasks`,
`topics` and `tasks<number>` belong to the plugin itself.

Press **Update commands** after adding or removing topics: the list Telegram holds is replaced
whole, so it only changes when it is sent again.

### How tasks are read

Tasks are read in the [Tasks](https://publish.obsidian.md/tasks/) plugin's emoji format:

```markdown
- [ ] Call the doctor 📅 2026-09-20
```

- Only the due date (📅) counts. Other fields are recognised well enough to be kept out of the
  answer, but they do not decide anything.
- A task counts as open unless its status is `x`, `X` or `-`.
- The range runs from today forward. Tasks due before today are not reported yet.
- A task without a due date is never reported.

Notes are found through Obsidian's own metadata cache, so a search reads only the notes that
actually hold checkboxes, and it never writes anything.

## Privacy and safety

- **The bot token is stored in plain text** in `<vault>/.obsidian/plugins/<id>/data.json`.
  Obsidian offers no encrypted storage, so treat the vault as a secret. The token is never
  written to a notice, a log or the console.
- **The allowlist fails closed.** An empty list of allowed chats means nobody, not everybody.
  It is the only thing between the vault and anyone who finds the bot.
- **The command menu is public.** Anyone who finds the bot sees the list of commands, but only
  an allowed chat gets an answer.
- The only host the plugin contacts is `api.telegram.org`, and only to receive your messages,
  download what you attached and send what you asked for. There is no telemetry, and nothing
  leaves the vault unless a command asked for it.
- Note contents are only sent back to your own chat, in reply to a command.

## What it does not do yet

- Albums arrive from Telegram as separate messages, and each one is filed on its own.
- Files larger than 20 MB cannot be downloaded by a bot; the attachment is skipped and the text
  is still saved.
- Edited messages are ignored on purpose, so an edit cannot land in a note a second time.
- Receiving is long polling only, without webhooks.
- Overdue tasks are not reported.
- There is no schedule: the bot answers when asked, and does not send anything on its own.

## Development

```bash
npm install
npm run dev     # esbuild in watch mode, writes main.js with an inline sourcemap
npm run build   # type check, then a production build
npm run lint    # eslint, including the Obsidian plugin rules
```

The repository is meant to sit inside a vault at `<vault>/.obsidian/plugins/<id>/`, so a build
lands where Obsidian will load it. After a build, reload the plugin from **Settings → Community
plugins** to see the change.

## License

[0BSD](LICENSE): use it, change it, pass it on, with credit or without. It grew out of the
[Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin), which carries
the same license.
