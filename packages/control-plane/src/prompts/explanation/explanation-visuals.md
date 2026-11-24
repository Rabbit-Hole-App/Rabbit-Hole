{% block plan %}
# Visuals for this card
This card's visuals: {% slot parts %}{% slot no-diagram %}.{% slot second-visual %}{% slot depth-treatment %} {% slot complete %}
{% endblock %}

{% block picture %}a picture{% endblock %}
{% block kind %}a {% slot kind %} diagram{% endblock %}
{% block choose %}a diagram of one of these kinds, the one that teaches the answer: {% slot kinds %}{% endblock %}
{% block any %}a diagram{% endblock %}
{% block no-diagram %}(no diagram){% endblock %}
{% block second-visual %}The question names two things: draw each one on its own, one visual per thing.{% endblock %}
{% block depth-treatment %}Depth treatment: {% slot treatment %}.{% endblock %}

{% block no-plan %}
# Visuals for this card
Choose visuals in this order. 1) Type: objects, 3D shapes, anatomy, places, living things and how something looks always get a picture first, then a process diagram second only if the thing also does something; a diagram alone is wrong for them; a "how does X work" or "how does X happen" question about a physical object, place or natural event (a volcano erupting, an eclipse, an engine) gets a picture of it and the process diagram; processes, relationships, comparisons, hierarchies, quantities, algorithms and data structures get diagrams; never use a picture for a data structure, an algorithm or numbers; a 3D object or a repeating structure — a molecule, a crystal lattice, a gear train, a mesh — is a picture, never a tree, figure or layers. Digital, abstract or procedural subjects — email, DNS, network protocols, algorithms, software, data structures, mathematics — never get a picture. They get a diagram only. 2) Diagram kind, by the shape of the answer: cycle when the last step feeds the first; sequence whenever two or more named parties send things to each other (client and server, sender and receiver, a protocol, request and response); timeline for dates or eras; transformation for inputs becoming outputs; tree for splits, sub-parts or sub-calls; relationship for causes; layers only for a real ordered stack; a question about a formula, a metric, a loss or how a quantity behaves gets a coordinate-plot of the function, with y computed from the formula the prose states at 7-12 x values (two decimals), or a bar-chart of one worked example; the title or caption says 'worked example'. A question comparing two distributions or sets of values gets two series on one plot or a grouped bar-chart; flow otherwise, a straight chain included (request, auth, handler, database). Three visuals are a maximum, not a target. Layers, matrix, comparison, flow, tree and figure cannot draw a shape, object, place or appearance; figure is only for a cell, a free-body diagram or a layered cross-section; comparison is for 2-4 separate items, never the parts of one thing. 3) Count: two visuals when the question names two things (X and Y, X vs Y) or asks both how something looks and how it works; otherwise one; a third only for a list of parallel points turned into a comparison, flow or tree. {% slot complete %}
{% endblock %}

{% block complete %}
The visual must contain the step or quantity the question is about: for a process, the action that produces the result (decrypt with the private key; the veto override; the frame popped at the base case); for a metric, the derived values (precision and recall from the four cells); for an operation on a structure, the structure with the operation applied. A visual that shows only the setup is incomplete.
{% endblock %}

{% block token-rule %}
A number the figure computes from others (fences, means, normalised weights, softmax outputs) is written as {{d:N.path}}, never typed (N is the number of the visual, path is into its spec: {{d:1.boxes.0.fences.upper}}).
{% endblock %}
