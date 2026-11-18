| # | phrase | expected | old index | new parser | note |
|---|---|---|---|---|---|
| 1 | `zero point three six eight` | 0.368 | 0.368 ok | 0.368 ok |  |
| 2 | `point five` | 0.5 | 5 WRONG | 0.5 ok | no leading digit |
| 3 | `point zero five` | 0.05 | 0, 5 WRONG | 0.05 ok |  |
| 4 | `three point five` | 3.5 | 3.5 ok | 3.5 ok |  |
| 5 | `thirty-six point eight percent` | 36.8 = 0.368 | 36.8 ok | 36.8 ok | hyphen + decimal + percent |
| 6 | `36.8%` | 36.8 = 0.368 | 36.8 ok | 36.8 ok | digits + symbol |
| 7 | `36.8 percent` | 36.8 = 0.368 | 36.8 ok | 36.8 ok |  |
| 8 | `eighty percent` | 80 = 0.8 | 80 ok | 80 ok |  |
| 9 | `one percent` | 1 = 0.01 | none WRONG | 1 ok | a lone one is a number once percent follows |
| 10 | `two thirds` | 0.6667 | 2 WRONG | 0.6666666666666666 ok | fraction |
| 11 | `a third of the data` | 0.3333 | none WRONG | 0.3333333333333333 ok |  |
| 12 | `three quarters` | 0.75 | 3 WRONG | 0.75 ok |  |
| 13 | `a half` | 0.5 | none WRONG | 0.5 ok |  |
| 14 | `one half` | 0.5 | none WRONG | 0.5 ok |  |
| 15 | `two and a half` | 2.5 | 2 WRONG | 2.5 ok |  |
| 16 | `one hundred` | 100 | 100 ok | 100 ok |  |
| 17 | `a hundred` | 100 | 100 ok | 100 ok |  |
| 18 | `one hundred and five` | 105 | 105 ok | 105 ok |  |
| 19 | `two hundred fifty` | 250 | 250 ok | 250 ok |  |
| 20 | `a thousand` | 1000 | 1000 ok | 1000 ok |  |
| 21 | `two thousand and twenty four` | 2024 | 2000, 24 WRONG | 2024 ok |  |
| 22 | `a million` | 1000000 | 1000000 ok | 1000000 ok |  |
| 23 | `minus two` | -2 | 2 WRONG | -2 ok | sign |
| 24 | `negative zero point five` | -0.5 | 0.5 WRONG | -0.5 ok |  |
| 25 | `-2` | -2 | 2 WRONG | -2 ok | digit with minus |
| 26 | `thirty-six` | 36 | 36 ok | 36 ok | hyphenated compound |
| 27 | `twenty five` | 25 | 25 ok | 25 ok |  |
| 28 | `nineteen eighty four` | 1984 | 19, 84 WRONG | 1984 ok | spoken year |
| 29 | `twenty twenty four` | 2024 | 20, 24 WRONG | 2024 ok | spoken year |
| 30 | `1,250` | 1250 | 1250 ok | 1250 ok | thousands separator |
| 31 | `1/2` | 0.5 | 1, 2 WRONG | 0.5 ok | digit fraction |
| 32 | `seven` | 7 | 7 ok | 7 ok | counting word: a number to the parser, free to the rule |
| 33 | `no one knows` | none (not a number) | none ok | none ok | pronoun |
| 34 | `one idea at a time` | none (not a number) | none ok | none ok | article/pronoun one |
| 35 | `the lowest point of the curve` | none (not a number) | none ok | none ok | noun point |
| 36 | `the first, second and third step` | none (not a number) | none ok | none ok | ordinals |
| 37 | `it takes one second` | none (not a number) | none ok | none ok | second as a unit (the one is a pronoun-like lone one) |
| 38 | `half of the time` | none (not a number) | none ok | none ok | bare half |
| 39 | `it happens once or twice` | none (not a number) | none ok | none ok | once/twice |
| 40 | `hundreds of examples` | none (not a number) | none ok | none ok | plural scale |
