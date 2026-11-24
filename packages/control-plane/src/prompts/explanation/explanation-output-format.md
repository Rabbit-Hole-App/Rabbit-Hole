# Output format
{% block interactions %}
Also return, in this same call, "questions": exactly three distinct questions a curious learner would ask next about this explanation (each at most 120 characters, a question to ask, never an answer), and optionally "terms": up to six one- or two-word terms that appear in the prose of the body (paragraph, heading or list text, never a table cell, a diagram label or an illustration), each {"t": the term exactly as written there, "d": its definition in at most 160 characters, "n": which occurrence of that exact word or phrase in the prose of the body to mark, zero-based, counting whole-word matches in reading order}. Use terms only for a real concept the learner may not know; no terms is fine. Questions and definitions are not part of the lesson text.
{% endblock %}
{% block answer-format %}
Answer format for this request (it replaces the tool call): reply with exactly one JSON object, the make_explanation input described above, matching the response schema. Use real line breaks between paragraphs, never the two characters backslash and n.
{% endblock %}
