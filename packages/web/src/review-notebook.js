// The canvas notebook review board's document (docs/features/canvas-notebook.md).
// Its outputs are real: the cells were run in the canvas notebook on the parallel
// clone and the saved .ipynb was copied here unchanged.
export const reviewNotebook = {
  "metadata": {
    "kernelspec": {
      "display_name": "Python (Pyodide)",
      "language": "python",
      "name": "python"
    },
    "language_info": {
      "codemirror_mode": {
        "name": "python",
        "version": 3
      },
      "file_extension": ".py",
      "mimetype": "text/x-python",
      "name": "python",
      "nbconvert_exporter": "python",
      "pygments_lexer": "ipython3",
      "version": "3.8"
    }
  },
  "nbformat_minor": 5,
  "nbformat": 4,
  "cells": [
    {
      "id": "intro",
      "cell_type": "markdown",
      "source": "## Softmax by hand\n\nThree raw scores become three probabilities. Run each cell, then change `scores` and run again.",
      "metadata": {}
    },
    {
      "id": "scores",
      "cell_type": "code",
      "source": "import math\nscores = [2.0, 1.0, 0.1]\nscores",
      "metadata": {
        "trusted": true
      },
      "outputs": [
        {
          "execution_count": 1,
          "output_type": "execute_result",
          "data": {
            "text/plain": "[2.0, 1.0, 0.1]"
          },
          "metadata": {}
        }
      ],
      "execution_count": 1
    },
    {
      "id": "exps",
      "cell_type": "code",
      "source": "exps = [math.exp(s) for s in scores]\n[round(e, 3) for e in exps]",
      "metadata": {
        "trusted": true
      },
      "outputs": [
        {
          "execution_count": 2,
          "output_type": "execute_result",
          "data": {
            "text/plain": "[7.389, 2.718, 1.105]"
          },
          "metadata": {}
        }
      ],
      "execution_count": 2
    },
    {
      "id": "probs",
      "cell_type": "code",
      "source": "probs = [e / sum(exps) for e in exps]\nprint(\"probabilities:\", [round(p, 3) for p in probs])\nprint(\"sum:\", round(sum(probs), 6))",
      "metadata": {
        "trusted": true
      },
      "outputs": [
        {
          "name": "stdout",
          "output_type": "stream",
          "text": "probabilities: [0.659, 0.242, 0.099]\nsum: 1.0\n"
        }
      ],
      "execution_count": 3
    },
    {
      "id": "shift",
      "cell_type": "code",
      "source": "# Adding the same constant to every score changes nothing\nshifted = [math.exp(s + 100) for s in scores]\n[round(e / sum(shifted), 3) for e in shifted]",
      "metadata": {
        "trusted": true
      },
      "outputs": [
        {
          "execution_count": 4,
          "output_type": "execute_result",
          "data": {
            "text/plain": "[0.659, 0.242, 0.099]"
          },
          "metadata": {}
        }
      ],
      "execution_count": 4
    }
  ]
};

// The rest of the review workspace, seeded into the card's own files the first
// time it opens. model.py is what the notebook's later cells could import.
export const reviewWorkspace = {
  'model.py': 'import math\n\n\ndef softmax(scores):\n    """Turn raw scores into probabilities that sum to one."""\n    top = max(scores)\n    exps = [math.exp(s - top) for s in scores]\n    total = sum(exps)\n    return [e / total for e in exps]\n',
  'utils.py': 'def rounded(values, places=3):\n    return [round(v, places) for v in values]\n',
  'config.yaml': 'temperature: 1.0\nscores: [2.0, 1.0, 0.1]\n',
  'data/sample.json': '{"scores": [2.0, 1.0, 0.1], "labels": ["cat", "dog", "bird"]}\n',
  'data/notes.md': '# Data notes\n\nThree labelled scores for the softmax walkthrough.\n',
};
