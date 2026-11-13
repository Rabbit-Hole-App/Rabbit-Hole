import ChatComposer from './ChatComposer.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';

// The canvas's bottom chat strip (owner 2026-11-13), drawn while the right-side Chat is closed (AdaptiveCanvas composer slot;
// LearnPage passes it only then). It is the Chat's own composer shell (ChatComposer dock) over the Chat's own draft
// (chat.composer), so what is typed here is what the Chat shows. Send opens the Chat and the Chat's send loop takes the line as if it
// were typed there ({ typed }: ask.jsx registerSender), so routing, commands and the thread are the Chat's; the strip then leaves
// with the closed panel. A line the loop refuses stays in the draft.
// ponytail: no attachments, no Mode or Depth menus and no / picker here; a typed /command still runs through the Chat's dispatcher.
export default function CanvasChatStrip() {
  const chat = useChatWorkspace();
  if (!chat) return null;
  const { composer, panels } = chat;
  const send = text => { panels.openChat(); chat.ask({ typed: text }); };
  return <ChatComposer dock canvasStrip value={composer.text} onChange={composer.setText} onSubmit={send} placeholder="Ask anything" />;
}
