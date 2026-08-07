import type { ExamBankSeed, ExamQuestion } from '@/domain/types';

/** Test-only exam bank fixture — not shipped into the app DB. */
export const SEED_BANK: ExamBankSeed = {
  categories: [
    {
      id: 'cat-gce-ol',
      code: 'GCE_OL',
      name: 'GCE Ordinary Level',
      descriptionMd: 'Cameroon GCE Ordinary Level (Form 5) past papers and questions.',
    },
    {
      id: 'cat-gce-al',
      code: 'GCE_AL',
      name: 'GCE Advanced Level',
      descriptionMd: 'Cameroon GCE Advanced Level (Upper Sixth) past papers and questions.',
    },
  ],
  subjects: [
    {
      id: 'sub-ol-math',
      categoryId: 'cat-gce-ol',
      code: 'MATH',
      name: 'Mathematics',
      descriptionMd: 'OL Mathematics: algebra, geometry, and number.',
    },
    {
      id: 'sub-ol-phys',
      categoryId: 'cat-gce-ol',
      code: 'PHYS',
      name: 'Physics',
      descriptionMd: 'OL Physics: mechanics, waves, and electricity basics.',
    },
    {
      id: 'sub-ol-bio',
      categoryId: 'cat-gce-ol',
      code: 'BIO',
      name: 'Biology',
      descriptionMd: 'OL Biology: cells, osmosis, and life processes.',
    },
    {
      id: 'sub-al-math',
      categoryId: 'cat-gce-al',
      code: 'MATH',
      name: 'Mathematics',
      descriptionMd: 'AL Mathematics: calculus and further algebra.',
    },
    {
      id: 'sub-al-phys',
      categoryId: 'cat-gce-al',
      code: 'PHYS',
      name: 'Physics',
      descriptionMd: 'AL Physics: forces, motion, and energy.',
    },
    {
      id: 'sub-al-chem',
      categoryId: 'cat-gce-al',
      code: 'CHEM',
      name: 'Chemistry',
      descriptionMd: 'AL Chemistry: moles, stoichiometry, and structure.',
    },
  ],
  papers: [
    {
      id: 'paper-ol-math-2023-p1',
      subjectId: 'sub-ol-math',
      year: 2023,
      paperNumber: 1,
      title: 'Mathematics Paper 1',
      reference: 'GCE-OL-2023-MATH-P1',
      durationMinutes: 90,
      descriptionMd: 'OL Mathematics Paper 1 (2023). No formal sections.',
    },
    {
      id: 'paper-ol-math-2024-p2',
      subjectId: 'sub-ol-math',
      year: 2024,
      paperNumber: 2,
      title: 'Mathematics Paper 2',
      reference: 'GCE-OL-2024-MATH-P2',
      durationMinutes: 120,
      descriptionMd: 'OL Mathematics Paper 2 (2024) with Section A and Section B.',
    },
    {
      id: 'paper-ol-phys-2023-p2',
      subjectId: 'sub-ol-phys',
      year: 2023,
      paperNumber: 2,
      reference: 'GCE-OL-2023-PHYS-P2',
      descriptionMd: 'OL Physics Paper 2 (2023).',
    },
    {
      id: 'paper-ol-bio-2024-p1',
      subjectId: 'sub-ol-bio',
      year: 2024,
      paperNumber: 1,
      reference: 'GCE-OL-2024-BIO-P1',
      descriptionMd: 'OL Biology Paper 1 (2024).',
    },
    {
      id: 'paper-al-phys-2024-p2',
      subjectId: 'sub-al-phys',
      year: 2024,
      paperNumber: 2,
      reference: 'GCE-AL-2024-PHYS-P2',
      descriptionMd: 'AL Physics Paper 2 (2024).',
    },
    {
      id: 'paper-al-math-2023-p1',
      subjectId: 'sub-al-math',
      year: 2023,
      paperNumber: 1,
      reference: 'GCE-AL-2023-MATH-P1',
      descriptionMd: 'AL Mathematics Paper 1 (2023).',
    },
    {
      id: 'paper-al-chem-2024-p2',
      subjectId: 'sub-al-chem',
      year: 2024,
      paperNumber: 2,
      reference: 'GCE-AL-2024-CHEM-P2',
      descriptionMd: 'AL Chemistry Paper 2 (2024).',
    },
  ],
  sections: [
    {
      id: 'sec-math-a',
      subjectId: 'sub-ol-math',
      code: 'section_a',
      name: 'Section A',
      descriptionMd: 'Compulsory short questions.',
    },
    {
      id: 'sec-math-b',
      subjectId: 'sub-ol-math',
      code: 'section_b',
      name: 'Section B',
      descriptionMd: 'Longer structured questions.',
    },
  ],
  questions: [
    {
      id: 'ol-math-2023-p1-q4',
      numberLabel: '4',
      topic: 'Algebra',
      marks: 3,
      promptMd: '### Question 4\nSolve for $x$:\n\n$$3x - 7 = 2x + 5$$',
      answerMd: '$x = 12$',
      solutionMd:
        '1. Subtract $2x$ from both sides: $x - 7 = 5$.\n2. Add $7$ to both sides: $x = 12$.\n3. Check: $3(12)-7=29$ and $2(12)+5=29$.\n\n**Key idea:** apply the same operation to both sides.',
      hints: [
        'Collect terms containing $x$ on one side.',
        'Subtract $2x$, then add $7$ to both sides.',
      ],
      tags: ['linear equation', 'solve for x'],
    },
    {
      id: 'ol-math-2024-p2-q3',
      numberLabel: '3',
      topic: 'Algebra',
      marks: 4,
      promptMd:
        '### Question 3\nFactorise completely and hence solve:\n\n$$x^2 - 5x + 6 = 0$$',
      answerMd: '$(x-2)(x-3)=0$, so $x=2$ or $x=3$.',
      solutionMd:
        '1. Factors of $6$ adding to $-5$ are $-2$ and $-3$.\n2. Write $(x-2)(x-3)=0$.\n3. Apply the zero-product rule.\n4. Therefore $x=2$ or $x=3$.',
      hints: [
        'Find two numbers whose product is $6$ and sum is $-5$.',
        'The numbers are $-2$ and $-3$.',
      ],
      tags: ['quadratic', 'factorisation'],
    },
    {
      id: 'ol-math-2024-p2-q7',
      numberLabel: '7',
      topic: 'Geometry',
      marks: 3,
      promptMd:
        '### Question 7\nA circular garden has radius $7\\text{ m}$. Calculate its area, taking $\\pi=\\frac{22}{7}$.',
      answerMd: '$154\\text{ m}^2$',
      solutionMd:
        '1. Start with $A=\\pi r^2$.\n2. Substitute $A=\\frac{22}{7}\\times7^2$.\n3. Simplify to $154$.\n4. The answer is $154\\text{ m}^2$.',
      hints: ['Use $A=\\pi r^2$.', 'Substitute $r=7$.'],
      tags: ['circle', 'area', 'radius'],
    },
    {
      id: 'ol-math-2024-p2-q1',
      numberLabel: '1',
      topic: 'Algebra',
      marks: 6,
      promptMd: '### Question 1\nThis question has two parts about linear equations.',
      answerMd: 'See parts (a) and (b).',
      solutionMd: 'Work each sub-question in order, showing clear steps.',
      hints: ['Attempt (a) before (b).'],
      tags: ['structured', 'nested'],
    },
    {
      id: 'ol-math-2024-p2-q1a',
      parentQuestionId: 'ol-math-2024-p2-q1',
      numberLabel: '1(a)',
      topic: 'Algebra',
      marks: 3,
      promptMd: '### Question 1(a)\nSolve $2x+3=11$.',
      answerMd: '$x=4$',
      solutionMd: 'Subtract 3: $2x=8$. Divide by 2: $x=4$.',
      hints: ['Isolate $x$.'],
      tags: ['linear'],
    },
    {
      id: 'ol-math-2024-p2-q1b',
      parentQuestionId: 'ol-math-2024-p2-q1',
      numberLabel: '1(b)',
      topic: 'Algebra',
      marks: 3,
      promptMd: '### Question 1(b)\nHence find $3x-1$ when $x$ is the value from (a).',
      answerMd: '$11$',
      solutionMd: 'Substitute $x=4$: $3(4)-1=11$.',
      hints: ['Use your answer from (a).'],
      tags: ['substitution'],
    },
    {
      id: 'ol-phys-2023-p2-q5',
      numberLabel: '5',
      topic: 'Mechanics',
      marks: 3,
      promptMd:
        '### Question 5\nA car travels $150\\text{ km}$ in $3\\text{ h}$. Calculate its average speed.',
      answerMd: '$50\\text{ km h}^{-1}$',
      solutionMd:
        '1. Use $v=\\frac{d}{t}$.\n2. Substitute $d=150$ and $t=3$.\n3. $v=50\\text{ km h}^{-1}$.',
      hints: ['Average speed is distance divided by time.', 'Calculate $150\\div3$.'],
      tags: ['speed', 'distance', 'time'],
    },
    {
      id: 'al-phys-2024-p2-q2',
      numberLabel: '2',
      topic: 'Mechanics',
      marks: 4,
      promptMd:
        '### Question 2\nA force of $18\\text{ N}$ acts on a $6\\text{ kg}$ body initially at rest. Find its acceleration and speed after $4\\text{ s}$.',
      answerMd: '$a=3\\text{ m s}^{-2}$ and $v=12\\text{ m s}^{-1}$.',
      solutionMd:
        '1. Rearrange $F=ma$: $a=\\frac{F}{m}$.\n2. $a=18/6=3\\text{ m s}^{-2}$.\n3. Use $v=u+at$.\n4. $v=0+(3)(4)=12\\text{ m s}^{-1}$.',
      hints: ['Start with $F=ma$.', 'Then use $v=u+at$ with $u=0$.'],
      tags: ['newton second law', 'force', 'acceleration'],
    },
    {
      id: 'al-math-2023-p1-q6',
      numberLabel: '6',
      topic: 'Calculus',
      marks: 4,
      promptMd:
        '### Question 6\nGiven $y=2x^3-5x^2+4$, find $\\frac{dy}{dx}$ and the gradient at $x=2$.',
      answerMd: '$\\frac{dy}{dx}=6x^2-10x$; gradient $=4$.',
      solutionMd:
        '1. Differentiate $2x^3$ to $6x^2$.\n2. Differentiate $-5x^2$ to $-10x$.\n3. Thus $\\frac{dy}{dx}=6x^2-10x$.\n4. At $x=2$, the gradient is $4$.',
      hints: ['Apply the power rule term by term.', 'Substitute $x=2$ after differentiating.'],
      tags: ['differentiation', 'gradient'],
    },
    {
      id: 'al-chem-2024-p2-q4',
      numberLabel: '4',
      topic: 'Mole Concept',
      marks: 3,
      promptMd:
        '### Question 4\nCalculate the amount in moles in $9.0\\text{ g}$ of water. Use $M_r(\\mathrm{H_2O})=18.0$.',
      answerMd: '$0.50\\text{ mol}$',
      solutionMd:
        '1. Use $n=\\frac{m}{M}$.\n2. Substitute $n=\\frac{9.0}{18.0}$.\n3. Therefore $n=0.50\\text{ mol}$.',
      hints: ['Use $n=\\frac{m}{M}$.', 'Divide $9.0$ by $18.0$.'],
      tags: ['moles', 'molar mass', 'stoichiometry'],
    },
    {
      id: 'ol-bio-2024-p1-q8',
      numberLabel: '8',
      topic: 'Cell Biology',
      marks: 2,
      promptMd: '### Question 8\nDefine **osmosis** and state the membrane required.',
      answerMd:
        'Net movement of water from higher to lower water potential through a partially permeable membrane.',
      solutionMd:
        'A full definition has three parts:\n1. **Particle:** water molecules.\n2. **Direction:** higher to lower water potential.\n3. **Barrier:** a partially permeable membrane.',
      hints: ['Name the particles and direction.', 'The membrane lets some substances through.'],
      tags: ['osmosis', 'membrane', 'water potential'],
    },
  ],
  paperSections: [
    { paperId: 'paper-ol-math-2024-p2', sectionId: 'sec-math-a', sortOrder: 0 },
    { paperId: 'paper-ol-math-2024-p2', sectionId: 'sec-math-b', sortOrder: 1 },
  ],
  paperQuestions: [
    { paperId: 'paper-ol-math-2023-p1', questionId: 'ol-math-2023-p1-q4', sortOrder: 0 },
    {
      paperId: 'paper-ol-math-2024-p2',
      questionId: 'ol-math-2024-p2-q1',
      sectionId: 'sec-math-a',
      sortOrder: 0,
    },
    {
      paperId: 'paper-ol-math-2024-p2',
      questionId: 'ol-math-2024-p2-q1a',
      sectionId: 'sec-math-a',
      sortOrder: 1,
    },
    {
      paperId: 'paper-ol-math-2024-p2',
      questionId: 'ol-math-2024-p2-q1b',
      sectionId: 'sec-math-a',
      sortOrder: 2,
    },
    {
      paperId: 'paper-ol-math-2024-p2',
      questionId: 'ol-math-2024-p2-q3',
      sectionId: 'sec-math-a',
      sortOrder: 3,
    },
    {
      paperId: 'paper-ol-math-2024-p2',
      questionId: 'ol-math-2024-p2-q7',
      sectionId: 'sec-math-b',
      sortOrder: 0,
    },
    { paperId: 'paper-ol-phys-2023-p2', questionId: 'ol-phys-2023-p2-q5', sortOrder: 0 },
    { paperId: 'paper-ol-bio-2024-p1', questionId: 'ol-bio-2024-p1-q8', sortOrder: 0 },
    { paperId: 'paper-al-phys-2024-p2', questionId: 'al-phys-2024-p2-q2', sortOrder: 0 },
    { paperId: 'paper-al-math-2023-p1', questionId: 'al-math-2023-p1-q6', sortOrder: 0 },
    { paperId: 'paper-al-chem-2024-p2', questionId: 'al-chem-2024-p2-q4', sortOrder: 0 },
  ],
};

/** Flat projection for legacy tests / sync adapters. */
export const SEED_QUESTIONS: ExamQuestion[] = SEED_BANK.questions
  .filter((q) => !q.parentQuestionId)
  .map((q) => {
    const link = SEED_BANK.paperQuestions.find((row) => row.questionId === q.id);
    const paper = SEED_BANK.papers.find((p) => p.id === link?.paperId);
    const subject = SEED_BANK.subjects.find((s) => s.id === paper?.subjectId);
    const category = SEED_BANK.categories.find((c) => c.id === subject?.categoryId);
    const legacyCategory = category?.code === 'GCE_AL' ? 'AL' : 'OL';
    return {
      id: q.id,
      category: legacyCategory as 'OL' | 'AL',
      subject: subject?.name || 'Unknown',
      year: paper?.year || 0,
      paper: paper?.paperNumber || 1,
      number: Number(String(q.numberLabel).replace(/\D/g, '')) || 0,
      topic: q.topic,
      marks: q.marks,
      markdown: q.promptMd,
      answerMarkdown: q.answerMd,
      explanationMarkdown: q.solutionMd,
      hints: q.hints,
      tags: q.tags,
    };
  });
