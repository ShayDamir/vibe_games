[x] Do not allow duplicate words in the same round
[x] Allow words with no rule, but limit them to 3 per round
[x] Allow assigning a level to a word (a1, a2, b1, b2, c1, c2)
[x] Write a python script that ingests files like ../../words/a1.txt, determining rules on the fly, assigning the levels too.
[x] Write a python script that validates words.js, checking that rules are assigned correctly (maybe a variation of previous script)
[ ] Ingest a1, a2, b1 and b2.txt, adding words to words.js according to the levels
[ ] the game starts at level a1, and unlocking other word levels is done by spending coins
[ ] price calibration for unlocking the word level: 3 perfect 20-streak rounds
[ ] add a button in the store to reset the local storage and start from scratch. Double-ask the user before doing that.
[ ] keep a list of last 10 player failures and mix up to 3 of them randomly into every round, giving double points if player gets them right this time (add ERROR RECOVERY label to the card) and remove them from the list
