// The flat, numbered view of a course used by the contents rail - the ticks
// shown down the right edge once the Learn panel is retracted, and the list that
// appears when you hover them.
//
// `contents[i]` is lesson i's generated content, or null while it is still a
// title in the curriculum. A lesson without content is shown but not openable,
// matching what the panel's outline already does with it.
export function contentsEntries(lessons = [], contents = [], activeId = null) {
  return (lessons || []).map((lesson, index) => {
    const content = (contents || [])[index] || null;
    return {
      n: index + 1,
      label: lesson?.title || `Lesson ${index + 1}`,
      content,
      available: !!content,
      active: !!activeId && content?.id === activeId,
    };
  });
}
