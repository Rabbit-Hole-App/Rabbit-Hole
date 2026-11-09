# Canvas Chat Composer

| Review order | Preview | Shared template | App landmarks |
| --- | --- | --- | --- |
| 1. Composer | [07-chat-composer.html](clean/07-chat-composer.html) | [chat-composer.html](templates/chat-composer.html) | `ChatComposer.jsx`, `ask.jsx`, `ContextChips.jsx`, `DepthMenu.jsx`, `LearnSlash.jsx` |

## Composer

Keep the draft, This canvas chip and toolbar inside one frame. Put Add context, More reasoning, the selected detail level, slash commands and voice on the left, with the blue circular Send at the right. More reasoning uses a pressed button with a lightbulb and starts selected in the fixture. It represents more effort spent working through the request. Detail determines how much explanation appears in the answer.

[Open Answer detail](clean/60-chat-answer-detail.html) to compare Brief, Balanced and Detailed. Each row describes the answer it gives you. Balanced starts checked. The toolbar shows the current level and its one-, two- or three-bar icon. The radio choices support arrow keys, Enter and Escape. Keep the draft unchanged when either control is adjusted.

Grow the composer vertically as the user writes. Once the draft reaches its height limit, scroll the text field so the context and toolbar stay accessible. The composer fills the dock inside the panel.

## Slash commands

[Open the standalone slash picker](clean/61-slash-commands.html) or use the slash button in the composer. Both use [chat-slash-picker.html](templates/chat-slash-picker.html). Use Commands as the picker heading. Place the [shared command pill](components/controls/slash-command-pills/markup.html) and typed command in a fixed leading column. Align all descriptions in the column beside it. The picker can grow to 520 px within the available width. The search matches typed names, aliases and descriptions. Arrow keys move between results, Enter chooses one, and Escape clears the search before closing the composer picker. A choice inserts the command and preserves the draft.

Put the existing square-slash button at the top right of the picker. In the app it calls `LearnSlash.onHelp` to open `SlashCommandsSheet`. In the HTML fixture it opens the example prompts from `learn-slash.js::EXAMPLES`. The fixture catalogue comes from `pickerSections('/')` using the checkout’s default capabilities.
