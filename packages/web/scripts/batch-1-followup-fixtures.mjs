export const sequenceSelfMessage = {
  version: 1,
  diagram: {
    kind: 'sequence',
    title: 'Read an encrypted message',
    actors: [{ id: 'sender', label: 'Sender' }, { id: 'receiver', label: 'Receiver' }],
    messages: [
      { from: 'sender', to: 'receiver', label: 'Send encrypted message' },
      { from: 'receiver', to: 'receiver', label: 'Decrypt with private key' },
      { from: 'receiver', to: 'sender', label: 'Confirm receipt' },
    ],
  },
};

export const convergingFlow = {
  version: 1,
  diagram: {
    kind: 'flow', title: 'Approval branches',
    nodes: [
      { id: 'review', label: 'Check the approval stage', role: 'decision' },
      { id: 'house', label: 'Did the House agree?', role: 'decision' },
      { id: 'senate', label: 'Did the Senate agree?', role: 'decision' },
      { id: 'sign', label: 'Was the bill signed?', role: 'decision' },
      { id: 'passed', label: 'Advance the bill', role: 'outcome' },
      { id: 'dies', label: 'Bill dies', role: 'outcome' },
    ],
    edges: [['house', 'House'], ['senate', 'Senate'], ['sign', 'Signature']].flatMap(([id, branch]) => [
      { from: 'review', to: id, label: branch },
      { from: id, to: 'dies', label: 'No' }, { from: id, to: 'passed', label: 'Yes' },
    ]),
  },
};
