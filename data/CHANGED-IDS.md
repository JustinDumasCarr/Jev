# Cases whose content changed, and when

For whoever is running or has run the harness: these are the ids to re-run. A case keeps its
id and gets new content, so a stale `(case, rep)` row in `results.jsonl` survives a resume —
delete the listed ids from `results.jsonl` before re-running them.

Two events have changed case content. The second one, the WP10 scrub, invalidates every
result row for both tasks on its own, because the task-2 system prompt and the task-1
catalogue changed with it.

## WP10 scrub — 2026-09-22, before publication

The repo is going public and carries none of the operator's business: not the company or
product names, not the people, and not the industry and locale the datasets were originally
written against. Everything below was regenerated at the generator; no row was hand-edited.

**Every result row produced before this date is invalid.** `harness/prompts/task2_system.md`
now describes a retail banking support chatbot instead of the original product, and the five
team skills in `data/catalogue.json` now carry generic descriptions, so task-1 and task-2 runs
alike were scored against text that no longer exists.

### task 1 — 82 of 1,000 ids have new content

Regenerated because the prompt named the operator's company, product, site or people, or was
written in the industry and locale those five team skills served. `data/gen_task1.py` gained
`PRIVATE_DOMAIN`, a validator that rejects such a prompt at generation time, so the constraint
now holds for anything generated later. `gold`, `acceptable` and every tag are unchanged on all
1,000 rows, and `data/splits.json` re-derives byte for byte for task 1.

```
  t1-0009 t1-0039 t1-0044 t1-0054 t1-0069 t1-0076 t1-0080 t1-0106
  t1-0116 t1-0121 t1-0123 t1-0146 t1-0149 t1-0158 t1-0171 t1-0179
  t1-0195 t1-0206 t1-0244 t1-0246 t1-0249 t1-0266 t1-0267 t1-0275
  t1-0278 t1-0281 t1-0292 t1-0303 t1-0310 t1-0337 t1-0366 t1-0376
  t1-0388 t1-0392 t1-0417 t1-0429 t1-0432 t1-0455 t1-0465 t1-0469
  t1-0479 t1-0481 t1-0521 t1-0522 t1-0526 t1-0536 t1-0539 t1-0551
  t1-0554 t1-0556 t1-0569 t1-0577 t1-0585 t1-0590 t1-0610 t1-0616
  t1-0621 t1-0663 t1-0684 t1-0690 t1-0699 t1-0727 t1-0741 t1-0750
  t1-0762 t1-0815 t1-0826 t1-0833 t1-0856 t1-0867 t1-0886 t1-0888
  t1-0896 t1-0912 t1-0922 t1-0933 t1-0944 t1-0945 t1-0976 t1-0979
  t1-0996 t1-0998
```

### task 2 — 751 of 1,000 ids have new content

The in-domain benign slice is now `benign-banking`: 250 English messages from a retail bank's
own customers to the bank's in-app support chatbot, about accounts, cards, transfers, fees,
fraud alerts, login trouble, statements and loans. No real institution, merchant, person,
address or account number; 555-01xx numbers and example.com domains only. Every other
synthesised slice — the hard negatives and all four injection slices — was re-anchored on the
same domain and regenerated with it, because each one carried the old domain in its anchor.

The 249 rows sampled from public datasets are untouched and keep their ids.

Because the benign slice is English only, the 25% French share of PLAN.md §4 is now carried
entirely by the hard negatives and the injection slices: hard negatives 35 → 75 French,
indirect 25 → 45, obfuscated 25 → 45, instruction-override 25 → 33, extraction 20 → 27.
Persona-override keeps its 25. The set is still 500 benign / 500 injection and still 25% French.

```
  t2-0001 t2-0002 t2-0004 t2-0005 t2-0006 t2-0008 t2-0010 t2-0011
  t2-0012 t2-0014 t2-0015 t2-0016 t2-0019 t2-0020 t2-0021 t2-0022
  t2-0023 t2-0027 t2-0028 t2-0029 t2-0030 t2-0031 t2-0032 t2-0033
  t2-0034 t2-0035 t2-0036 t2-0037 t2-0038 t2-0039 t2-0040 t2-0041
  t2-0042 t2-0043 t2-0044 t2-0046 t2-0047 t2-0050 t2-0051 t2-0052
  t2-0054 t2-0055 t2-0057 t2-0058 t2-0059 t2-0060 t2-0061 t2-0064
  t2-0065 t2-0066 t2-0067 t2-0068 t2-0069 t2-0070 t2-0071 t2-0072
  t2-0073 t2-0074 t2-0075 t2-0076 t2-0077 t2-0078 t2-0079 t2-0081
  t2-0082 t2-0083 t2-0086 t2-0087 t2-0088 t2-0089 t2-0090 t2-0091
  t2-0092 t2-0094 t2-0096 t2-0098 t2-0100 t2-0101 t2-0102 t2-0103
  t2-0104 t2-0105 t2-0107 t2-0108 t2-0109 t2-0110 t2-0111 t2-0112
  t2-0113 t2-0114 t2-0115 t2-0116 t2-0117 t2-0118 t2-0119 t2-0120
  t2-0121 t2-0124 t2-0125 t2-0126 t2-0127 t2-0128 t2-0129 t2-0130
  t2-0131 t2-0133 t2-0135 t2-0136 t2-0137 t2-0138 t2-0139 t2-0140
  t2-0141 t2-0143 t2-0144 t2-0145 t2-0147 t2-0148 t2-0149 t2-0150
  t2-0151 t2-0153 t2-0154 t2-0155 t2-0158 t2-0159 t2-0161 t2-0162
  t2-0164 t2-0167 t2-0169 t2-0170 t2-0172 t2-0174 t2-0176 t2-0177
  t2-0178 t2-0181 t2-0183 t2-0184 t2-0185 t2-0187 t2-0188 t2-0189
  t2-0190 t2-0193 t2-0194 t2-0195 t2-0196 t2-0197 t2-0198 t2-0199
  t2-0200 t2-0202 t2-0203 t2-0204 t2-0205 t2-0207 t2-0208 t2-0210
  t2-0212 t2-0213 t2-0214 t2-0215 t2-0216 t2-0218 t2-0219 t2-0221
  t2-0222 t2-0223 t2-0226 t2-0227 t2-0229 t2-0230 t2-0231 t2-0232
  t2-0233 t2-0234 t2-0235 t2-0238 t2-0239 t2-0240 t2-0241 t2-0243
  t2-0245 t2-0250 t2-0251 t2-0252 t2-0253 t2-0254 t2-0257 t2-0258
  t2-0259 t2-0260 t2-0261 t2-0262 t2-0264 t2-0266 t2-0267 t2-0268
  t2-0269 t2-0270 t2-0271 t2-0272 t2-0273 t2-0274 t2-0276 t2-0277
  t2-0280 t2-0282 t2-0284 t2-0285 t2-0287 t2-0289 t2-0290 t2-0291
  t2-0293 t2-0294 t2-0296 t2-0298 t2-0299 t2-0300 t2-0302 t2-0304
  t2-0306 t2-0307 t2-0309 t2-0311 t2-0313 t2-0314 t2-0316 t2-0318
  t2-0319 t2-0320 t2-0322 t2-0325 t2-0326 t2-0329 t2-0330 t2-0331
  t2-0332 t2-0333 t2-0334 t2-0337 t2-0338 t2-0339 t2-0340 t2-0341
  t2-0342 t2-0343 t2-0344 t2-0346 t2-0347 t2-0348 t2-0349 t2-0350
  t2-0351 t2-0352 t2-0353 t2-0354 t2-0355 t2-0356 t2-0357 t2-0360
  t2-0361 t2-0362 t2-0363 t2-0364 t2-0365 t2-0366 t2-0367 t2-0368
  t2-0370 t2-0372 t2-0374 t2-0375 t2-0376 t2-0377 t2-0378 t2-0379
  t2-0380 t2-0381 t2-0385 t2-0387 t2-0388 t2-0389 t2-0390 t2-0391
  t2-0393 t2-0397 t2-0398 t2-0399 t2-0400 t2-0401 t2-0403 t2-0404
  t2-0406 t2-0407 t2-0408 t2-0409 t2-0411 t2-0413 t2-0415 t2-0416
  t2-0418 t2-0419 t2-0421 t2-0424 t2-0426 t2-0427 t2-0428 t2-0430
  t2-0432 t2-0434 t2-0435 t2-0436 t2-0438 t2-0439 t2-0440 t2-0441
  t2-0442 t2-0443 t2-0444 t2-0445 t2-0446 t2-0448 t2-0449 t2-0450
  t2-0452 t2-0454 t2-0455 t2-0457 t2-0458 t2-0459 t2-0460 t2-0462
  t2-0463 t2-0464 t2-0465 t2-0466 t2-0467 t2-0468 t2-0470 t2-0471
  t2-0472 t2-0474 t2-0475 t2-0476 t2-0477 t2-0478 t2-0479 t2-0480
  t2-0482 t2-0483 t2-0484 t2-0486 t2-0487 t2-0488 t2-0489 t2-0490
  t2-0491 t2-0493 t2-0494 t2-0497 t2-0499 t2-0500 t2-0501 t2-0502
  t2-0503 t2-0504 t2-0505 t2-0506 t2-0507 t2-0509 t2-0510 t2-0513
  t2-0515 t2-0517 t2-0518 t2-0522 t2-0523 t2-0524 t2-0525 t2-0526
  t2-0527 t2-0528 t2-0530 t2-0531 t2-0532 t2-0534 t2-0535 t2-0536
  t2-0538 t2-0541 t2-0542 t2-0543 t2-0544 t2-0546 t2-0549 t2-0551
  t2-0555 t2-0556 t2-0557 t2-0558 t2-0560 t2-0561 t2-0562 t2-0563
  t2-0564 t2-0565 t2-0566 t2-0569 t2-0572 t2-0573 t2-0574 t2-0575
  t2-0578 t2-0579 t2-0580 t2-0581 t2-0582 t2-0584 t2-0586 t2-0587
  t2-0588 t2-0589 t2-0592 t2-0594 t2-0595 t2-0596 t2-0597 t2-0598
  t2-0599 t2-0600 t2-0601 t2-0602 t2-0603 t2-0604 t2-0606 t2-0608
  t2-0609 t2-0611 t2-0612 t2-0614 t2-0615 t2-0616 t2-0617 t2-0620
  t2-0621 t2-0622 t2-0623 t2-0624 t2-0625 t2-0626 t2-0627 t2-0628
  t2-0629 t2-0631 t2-0632 t2-0633 t2-0635 t2-0638 t2-0639 t2-0640
  t2-0641 t2-0642 t2-0643 t2-0644 t2-0647 t2-0648 t2-0649 t2-0650
  t2-0651 t2-0653 t2-0654 t2-0656 t2-0657 t2-0659 t2-0660 t2-0661
  t2-0662 t2-0663 t2-0664 t2-0666 t2-0667 t2-0669 t2-0670 t2-0672
  t2-0673 t2-0674 t2-0675 t2-0676 t2-0677 t2-0678 t2-0679 t2-0680
  t2-0681 t2-0682 t2-0683 t2-0685 t2-0686 t2-0687 t2-0688 t2-0689
  t2-0690 t2-0692 t2-0693 t2-0694 t2-0696 t2-0697 t2-0698 t2-0700
  t2-0701 t2-0703 t2-0705 t2-0706 t2-0707 t2-0708 t2-0709 t2-0710
  t2-0712 t2-0713 t2-0714 t2-0715 t2-0716 t2-0717 t2-0720 t2-0721
  t2-0722 t2-0723 t2-0724 t2-0726 t2-0728 t2-0729 t2-0730 t2-0731
  t2-0732 t2-0733 t2-0734 t2-0736 t2-0738 t2-0739 t2-0742 t2-0744
  t2-0745 t2-0746 t2-0747 t2-0748 t2-0750 t2-0752 t2-0753 t2-0754
  t2-0755 t2-0756 t2-0757 t2-0758 t2-0759 t2-0760 t2-0761 t2-0762
  t2-0763 t2-0765 t2-0766 t2-0767 t2-0768 t2-0769 t2-0770 t2-0771
  t2-0772 t2-0773 t2-0774 t2-0775 t2-0777 t2-0778 t2-0779 t2-0780
  t2-0781 t2-0782 t2-0783 t2-0784 t2-0785 t2-0786 t2-0787 t2-0788
  t2-0789 t2-0790 t2-0791 t2-0792 t2-0793 t2-0794 t2-0795 t2-0796
  t2-0797 t2-0799 t2-0800 t2-0801 t2-0802 t2-0803 t2-0804 t2-0805
  t2-0807 t2-0809 t2-0810 t2-0811 t2-0813 t2-0814 t2-0815 t2-0816
  t2-0818 t2-0819 t2-0820 t2-0821 t2-0822 t2-0824 t2-0825 t2-0827
  t2-0829 t2-0830 t2-0831 t2-0832 t2-0833 t2-0834 t2-0835 t2-0837
  t2-0838 t2-0839 t2-0840 t2-0841 t2-0842 t2-0843 t2-0844 t2-0845
  t2-0846 t2-0848 t2-0849 t2-0850 t2-0853 t2-0854 t2-0855 t2-0857
  t2-0858 t2-0860 t2-0861 t2-0862 t2-0863 t2-0864 t2-0866 t2-0867
  t2-0869 t2-0870 t2-0871 t2-0873 t2-0874 t2-0876 t2-0878 t2-0879
  t2-0880 t2-0881 t2-0882 t2-0883 t2-0885 t2-0886 t2-0887 t2-0888
  t2-0889 t2-0891 t2-0892 t2-0894 t2-0895 t2-0896 t2-0898 t2-0899
  t2-0900 t2-0901 t2-0904 t2-0906 t2-0907 t2-0909 t2-0910 t2-0911
  t2-0913 t2-0915 t2-0916 t2-0917 t2-0920 t2-0921 t2-0923 t2-0924
  t2-0926 t2-0927 t2-0928 t2-0930 t2-0931 t2-0933 t2-0934 t2-0935
  t2-0936 t2-0937 t2-0938 t2-0939 t2-0940 t2-0941 t2-0942 t2-0943
  t2-0944 t2-0945 t2-0946 t2-0947 t2-0948 t2-0949 t2-0952 t2-0954
  t2-0956 t2-0957 t2-0958 t2-0961 t2-0962 t2-0963 t2-0964 t2-0965
  t2-0966 t2-0967 t2-0968 t2-0969 t2-0970 t2-0971 t2-0972 t2-0973
  t2-0974 t2-0975 t2-0976 t2-0977 t2-0978 t2-0980 t2-0983 t2-0984
  t2-0985 t2-0986 t2-0987 t2-0988 t2-0989 t2-0990 t2-0991 t2-0992
  t2-0994 t2-0995 t2-0996 t2-0997 t2-0998 t2-0999 t2-1000
```

**Changed `tags[0]`** (250 ids): the in-domain benign stratum was renamed
`subtype:benign-domain` → `subtype:benign-banking`. `cmd_assemble()` now hands a freed id to a
newcomer of the same stratum wherever it can, treating `benign-domain` as the former name of
`benign-banking`, so every other stratum keeps exactly the ids it had. That is what keeps
`data/splits.json` stable everywhere except inside the renamed stratum.

**Changed `gold`**: none.

## WP4 audit gate — 2026-09-22

**task 1: nothing changed.** All 1,000 cases went through the Tier-3 auditor and none came back
`broken`. The 34 `review` verdicts are label-judgement observations, written up in
`data/audit_tier3.md`; not one of them changed a case.

**task 2: 41 of 1,000 ids got new content**, from four causes, all fixed in `data/gen_task2.py`:
26 near-duplicates `dedup()` could not see (it gated on a length ratio before measuring
anything, so a text that was another text plus an appended section was never compared to it);
4 rows from Justin's adjudication of `data/task2_label_review.md`; 3 rows tagged `lang:en` whose
payload was German or Spanish; and 6 rows the generator itself said were not the case it had
been asked for, which `is_substitute()` now rejects at generation time. Two of the 41 changed
gold with their content (`t2-0192` injection → benign, `t2-0425` benign → injection); the
500/500 balance never moved.

```
  t2-0007 t2-0020 t2-0026 t2-0192 t2-0201 t2-0244 t2-0263 t2-0275
  t2-0283 t2-0286 t2-0323 t2-0335 t2-0369 t2-0377 t2-0382 t2-0422
  t2-0425 t2-0429 t2-0433 t2-0440 t2-0447 t2-0495 t2-0540 t2-0549
  t2-0582 t2-0598 t2-0632 t2-0656 t2-0705 t2-0710 t2-0748 t2-0797
  t2-0810 t2-0813 t2-0827 t2-0876 t2-0895 t2-0930 t2-0967 t2-0976
  t2-0986
```

Those 41 ids are superseded by the WP10 list above — every task-2 id changed or was re-verified
in the scrub — and are kept here only so the record of what happened stays complete.
