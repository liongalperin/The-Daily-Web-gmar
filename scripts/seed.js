/**
 * Demo data seed script.
 * Generates 523 news articles across categories and statuses,
 * multiple reporters, editor, comments, and multi-update articles with rich
 * timeseries view data for the Impact Analytics graph.
 *
 * Runnable via: npm run seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, Article, Comment, ViewStats } = require('../models');
const logger = require('../config/logger');

// Realistic Hebrew News Content Corpus
const CATEGORIES = ['news', 'politics', 'business', 'tech', 'sports', 'culture', 'transport'];

const HEADLINES = {
  news: [
    'הסכם היסטורי נחתם בעיריית תל אביב להרחבת שטחי הציבור והפארקים',
    'חילוץ דרמטי בנחל דרגה: מטיילים שנקלעו לשיטפון חולצו בשלום',
    'גל חום כבד צפוי בסוף השבוע: משרד הבריאות מפרסם הנחיות בטיחות',
    'תחנת רכבת חדשה תוקם בשרון: זמני הנסיעה למרכז יתקצרו משמעותית',
    'מבצע ארצי להורדת מחירי מוצרי היסוד יצא לדרך בהובלת רשתות השיווק',
    'פרויקט פינוי-בינוי ענק אושר בחיפה: אלפי דירות חדשות ייבנו',
    'גשמי ברכה בצפון: מפלס הכנרת עלה ב-3 סנטימטרים ביממה האחרונה',
    'סקר חדש מגלה: זינוק בשביעות הרצון משירותי התחבורה הציבורית',
    'פסטיבל האור הבינלאומי בירושלים מושך מאות אלפי מבקרים',
    'הוקם מרכז רפואי חדשני לרפואה מונעת בנגב בהשקעה של מיליוני שקלים'
  ],
  tech: [
    'פריצת דרך עולמית: חוקרים ישראלים פיתחו מחשב קוונטי מבוסס פוטונים',
    'סטארט-אפ ישראלי בתחום הסייבר גייס 120 מיליון דולר בסבב ב\'',
    'הושק הדור הבא של מודלי בינה מלאכותית להבנת שפה טבעית',
    'מהפכה ברפואה: אלגוריתם חדש מזהה מחלות נדירות בדיוק של 99%',
    'הסוללה שתשנה הכל: טעינה מלאה של רכב חשמלי בתוך 5 דקות בלבד',
    'חברות הענק נכנסות לתחום המחשוב הלביש עם משקפי מציאות רבודה',
    'אבטחת מידע בעידן הענן: המדריך השלם להגנה על ארגונים ומאגרי נתונים',
    'מעבד חדשני שובר שיאי ביצועים ויעילות אנרגטית במחשבים ניידים',
    'רובוט אוטונומי חדש מסייע לצוותי חילוץ באזורי אסון',
    'טכנולוגיית לוויינים זעירים מאפשרת חיבור אינטרנט מהיר לכל נקודה בעולם'
  ],
  business: [
    'הבורסה בתל אביב נעלה בעליות שערים חדות בהובלת מדד הטכנולוגיה',
    'בנק ישראל מותיר את הריבית ללא שינוי ומעדכן את תחזית הצמיחה',
    'דוחות חזקים ברבעון השלישי: חברות הנדל"ן רושמות הכנסות שיא',
    'השקל מתחזק מול הדולר והיורו בעקבות נתוני מאקרו מעודדים',
    'הסכם סחר חדש נחתם עם איחוד האמירויות בהיקף של מיליארדי שקלים',
    'ענף ההייטק הישראלי ממשיך להוביל: שיא בגיוסי הון ברבעון החולף',
    'רפורמה בתחום המיסוי: הקלות משמעותיות לעסקים קטנים ובינוניים',
    'שוק הרכב הישראלי עובר לחשמל: זינוק של 45% ברכישת רכבים ירוקים',
    'השקעות ענק באנרגיה סולארית: שדות סולאריים חדשים יוקמו בדרום',
    'קרנות הפנסיה מציגות תשואות חיוביות חזקות מתחילת השנה'
  ],
  politics: [
    'הכנסת אישרה בקריאה שלישית את חוק הגנת הצרכן הדיגיטלי',
    'פגישה מדינית מכרעת בוושינגטון בנושא הסכמי שיתוף הפעולה האזוריים',
    'ועדת הכלכלה דנה במחירי הדיור ודורשת צעדי חירום מידיים',
    'הצעת חוק חדשה: הרחבת ימי החופשה והורדת שעות העבודה השבועיות',
    'עימות סוער במליאה על תקציב המדינה לשנה הבאה',
    'הבחירות לרשויות המקומיות: אחוזי הצבעה גבוהים במיוחד בערים המרכזיות',
    'שר האנרגיה חתם על תוכנית לאומית להפחתת פליטות פחמן',
    'הסכמה רחבה בוועדת החוקה על רפורמת השירות הציבורי',
    'דו"ח מבקר המדינה מצביע על שיפור ניכר במוכנות לשעת חירום',
    'קואליציה ואופוזיציה הגיעו להבנות על קידום חוק הדיגיטציה הממשלתית'
  ],
  sports: [
    'ניצחון דרמטי בדקה ה-90: מכבי תל אביב מעפילה לשלב הבתים באירופה',
    'מדליית זהב לישראל באליפות העולם בג\'ודו לאחר קרב הירואי',
    'עונת הכדורסל נפתחת בסערה: הדרבי התל אביבי סיפק דרמה ענקית',
    'המרתון הבינלאומי של ירושלים שבר שיא משתתפים עם עשרות אלפי רצים',
    'הישג שיא לשחיין הישראלי: שיא ישראלי חדש במשחה ל-100 מטר חופשי',
    'נבחרת הנוער בכדורגל רשמה הישג היסטורי באליפות אירופה',
    'מהפך ענק בליגת העל: הפועל באר שבע ניצחה במשחק העונה',
    'טניסאי ישראלי צעיר העפיל לראשונה לטורניר גראנד סלאם יוקרתי',
    'נבחרת ההתעמלות האמנותית של ישראל זכתה במקום הראשון בתחרות הסבב',
    'אצטדיון חדשני ברמה אירופית נחנך בצפון הארץ בטקס חגיגי'
  ],
  culture: [
    'פרס ישראל לספרות הוענק לסופר המוערך על תרומתו לתרבות הישראלית',
    'סרט ישראלי חדש גרף שלושה פרסים יוקרתיים בפסטיבל קאן',
    'תערוכת אמנות בינלאומית נפתחה במוזיאון תל אביב לאמנות',
    'ההצגה החדשה בתיאטרון הבימה זוכה לשבחים מקיר לקיר מהמבקרים',
    'פסטיבל הקולנוע בירושלים יקרין מעל 150 סרטים מרחבי העולם',
    'אלבום הבכורה של הזמרת הצעירה כובש את מצעדי ההשמעות ברדיו',
    'שבוע הספר העברי נפתח במוקדים שונים ברחבי הארץ עם ירידי ספרים ענקיים',
    'המופע המוזיקלי הגדול של השנה נמכר במלואו בתוך פחות משעה',
    'פרויקט שימור אתרי מורשת לאומיים קיבל תקציב מיוחד של מיליונים',
    'סדרת דרמה ישראלית נמכרה לשידור ברשת סטרימינג בינלאומית'
  ],
  transport: [
    'הקו האדום של הרכבת הקלה בגוש דן שובר שיאי נוסעים חדשים',
    'נתיבי איילון: נחנך נתיב מהיר נוסף לתחבורה ציבורית ושיתופית',
    'רפורמת התחבורה החכמה: אפליקציה אחודה לתשלום בכל אמצעי התחבורה',
    'פרויקט המסילה המזרחית מתקדם: קו רכבת ישיר בין השרון לדרום',
    'רשת שבילי אופניים רציפה באורך 100 ק"מ מחברת את ערי המרכז',
    'רכבת ישראל מרחיבה את שעות הפעילות בלילות ובסופי שבוע',
    'צי האוטובוסים החשמליים בישראל מתרחב ל-2,000 אוטובוסים ירוקים',
    'נמל התעופה בן גוריון מוביל מהפכה טכנולוגית לקיצור תורים',
    'נפתח לתנועה מחלף חדש בכביש 6 המפחית עומסים בצורה דרמטית',
    'השקת מוניות אוטונומיות ראשונות לנסיעות מבחן מבוקרות בתל אביב'
  ]
};

const SAMPLE_IMAGES = [
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800',
  'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
  'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800',
  'https://images.unsplash.com/photo-1546422904-90eab23c3d7e?w=800',
  'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
  'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800'
];

const SAMPLE_COMMENTS = [
  'כתבה מרתקת וחשובה מאוד! כל הכבוד על הסיקור המעמיק.',
  'יופי של חדשות, סוף סוף רואים התקדמות אמיתית בנושא הזה.',
  'תודה על הדיווח המקצועי, עוקב בעניין אחרי ההתפתחויות.',
  'מעניין מאוד. האם יש מידע נוסף לגבי לוחות הזמנים המתוכננים?',
  'צעד מבורך וחשוב ביותר לציבור הרחב.',
  'סיקור עיתונאי למופת, הלוואי ועוד אתרי חדשות היו מעמיקים כך.',
  'מחכה לראות איך הדברים ייראו בשטח בחודשים הקרובים.',
  'חידוש מצוין ומשמעותי! בהחלט מעורר תקווה.'
];

async function seedDatabase(customUri) {
  const uri = customUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/dailyweb';
  console.log('Connecting to MongoDB for seeding:', uri);

  let ownConnection = false;
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
      ownConnection = true;
    } catch (connErr) {
      console.error('\nFailed to connect to MongoDB at:', uri);
      console.error('If running locally, make sure MongoDB is running (e.g. `net start MongoDB` or `mongod`).');
      console.error('Or specify a remote/Atlas URI in .env: MONGODB_URI=mongodb+srv://...\n');
      console.error('Note: the tests run on an in-memory database and don\'t need MongoDB:');
      console.error('   npm test\n');
      process.exit(1);
    }
  }

  try {
    console.log('Removing previous demo data...');
    await Promise.all([
      User.deleteMany({}),
      Article.deleteMany({}),
      Comment.deleteMany({}),
      ViewStats.deleteMany({})
    ]);

    // 1. Create Core Users
    console.log('Creating staff accounts...');
    const editor = await User.createUser({
      username: 'editor',
      password: 'password123',
      role: 'Editor',
      fullName: 'שרה שפירא - עורכת ראשית'
    });

    const reporters = await Promise.all([
      User.createUser({
        username: 'reporter1',
        password: 'password123',
        role: 'Reporter',
        fullName: 'איתי לוי - כתב טכנולוגיה ומדע'
      }),
      User.createUser({
        username: 'reporter2',
        password: 'password123',
        role: 'Reporter',
        fullName: 'נועה כרמי - כתבת פוליטיקה וחדשות'
      }),
      User.createUser({
        username: 'reporter3',
        password: 'password123',
        role: 'Reporter',
        fullName: 'דני רופ - כתב תחבורה וסביבה'
      }),
      User.createUser({
        username: 'reporter4',
        password: 'password123',
        role: 'Reporter',
        fullName: 'מיכל אברהם - כתבת כלכלה ועסקים'
      }),
      User.createUser({
        username: 'reporter5',
        password: 'password123',
        role: 'Reporter',
        fullName: 'עומר שדה - כתב ספורט ותרבות'
      })
    ]);

    console.log(`Created 1 Editor and ${reporters.length} Reporters (password: password123)`);

    // 2. Prepare Articles (Total > 520 articles)
    console.log('Generating articles...');

    const now = Date.now();
    const ONE_HOUR = 3600 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const articlesToInsert = [];
    const viewStatsToInsert = [];

    // A. 5 Multi-Update Flagship Articles for Impact Analytics & Diff Showcase
    const flagshipArticlesData = [
      {
        category: 'tech',
        status: 'Published',
        title: 'פריצת דרך היסטורית: פותח מחשב קוונטי ישראלי ראשון',
        summary: 'חוקרים ישראלים השלימו בהצלחה את הפעלת המחשב הקוונטי הראשון בישראל.',
        content: `חוקרים ישראלים השלימו היום בהצלחה את הפעלתו של המחשב הקוונטי הראשון בישראל. המערכת כוללת 64 קיוביטים ומציגה דיוק חסר תקדים.`
      },
      {
        category: 'transport',
        status: 'Pending', // An update waiting for review, to show the published vs new comparison
        title: 'רפורמת התחבורה הציבורית: רשת קווי רכבת קלה חדשה אושרה בממשלה',
        summary: 'הממשלה אישרה תקציב עתק של 15 מיליארד ש"ח להרחבת רשת הרכבות הקלות במטרופולין גוש דן.',
        content: `הממשלה אישרה היום תקציב עתק של 15 מיליארד שקלים להרחבת רשת הרכבות הקלות במרכז.`
      },
      {
        category: 'business',
        status: 'Pending', // Set to Pending for diff testing
        title: 'עסקת ענק בהייטק: חברת סייבר ישראלית נמכרה ב-3.2 מיליארד דולר',
        summary: 'אקזיט ענק נוסף להייטק הישראלי: ענקית הטכנולוגיה האמריקאית רוכשת את חברת אבטחת הענן.',
        content: `עסקת ענק בתעשיית ההייטק המקומית: ענקית הטכנולוגיה הבינלאומית רוכשת חברת סייבר ישראלית.`
      },
      {
        category: 'news',
        status: 'Published',
        title: 'תגלית ארכיאולוגית נדירה בירושלים: מבנה עתיק מתקופת בית ראשון',
        summary: 'במהלך חפירות בעיר העתיקה נחשף מבנה ציבורי מרשים ובו עשרות חותמות וטביעות עבריות קדומות.',
        content: `ארכיאולוגים של רשות העתיקות חשפו בירושלים מבנה אבן מונומנטלי מימי הבית הראשון.`
      },
      {
        category: 'sports',
        status: 'Published',
        title: 'זהב כפול באליפות אירופה: משלחת הג\'ודו הישראלית רושמת הישג חסר תקדים',
        summary: 'שני ג\'ודוקות ישראלים זכו היום במדליות זהב באליפות אירופה שננעלה בפראג.',
        content: `הישג ספורטיבי כביר למשלחת הישראלית באליפות אירופה בג'ודו עם 2 מדליות זהב היסטוריות.`
      }
    ];

    for (let i = 0; i < flagshipArticlesData.length; i++) {
      const data = flagshipArticlesData[i];
      const author = reporters[i % reporters.length];
      const pubDate = new Date(now - 72 * ONE_HOUR);
      const update1 = new Date(now - 48 * ONE_HOUR);
      const update2 = new Date(now - 12 * ONE_HOUR);

      const articleId = new mongoose.Types.ObjectId();

      // Pre-calculate 73 hourly view buckets and totalViews for the flagship article
      const views = [];
      let totalViews = 0;
      for (let h = 72; h >= 0; h--) {
        const bucketTime = new Date(now - h * ONE_HOUR);
        bucketTime.setMinutes(0, 0, 0);

        let hourCount = Math.floor(Math.random() * 20) + 10;
        if (h <= 48 && h >= 40) {
          hourCount = Math.floor(Math.random() * 100) + 150; // Update 1 surge
        } else if (h <= 12 && h >= 4) {
          hourCount = Math.floor(Math.random() * 200) + 300; // Update 2 viral surge
        }

        views.push({ timestamp: bucketTime, count: hourCount });
        totalViews += hourCount;
      }

      viewStatsToInsert.push({
        articleId,
        views,
        totalViews
      });

      articlesToInsert.push({
        _id: articleId,
        authorId: author._id,
        category: data.category,
        status: data.status,
        publicVersion: {
          title: data.title,
          summary: data.summary,
          snippet: data.summary,
          content: data.content,
          imageUrl: SAMPLE_IMAGES[i % SAMPLE_IMAGES.length],
          category: data.category,
          publishedAt: update2
        },
        draftVersion: {
          title: data.title + ' [גרסה מעודכנת עם הרחבות]',
          summary: data.summary,
          snippet: data.summary,
          content: data.content + '\n\nתוספת חדשה: דיווחים ראשוניים מצביעים על שיתופי פעולה בינלאומיים נוספים.',
          imageUrl: SAMPLE_IMAGES[i % SAMPLE_IMAGES.length],
          category: data.category,
          updatedAt: new Date(now - 2 * ONE_HOUR)
        },
        publishHistory: [pubDate, update1, update2],
        totalViews,
        createdAt: pubDate,
        updatedAt: new Date(now - 2 * ONE_HOUR)
      });
    }

    // B. Bulk Articles: 395 Published articles with pre-calculated view counts
    for (let i = 0; i < 395; i++) {
      const cat = rand(CATEGORIES);
      const headline = rand(HEADLINES[cat]);
      const author = rand(reporters);
      const daysAgo = Math.floor(Math.random() * 30);
      const hoursAgo = Math.floor(Math.random() * 24);
      const pubDate = new Date(now - (daysAgo * ONE_DAY + hoursAgo * ONE_HOUR));

      const title = `${headline} (${i + 1})`;
      const summary = `${headline} - דיווח בלעדי מאת כתב The Daily Web על ההתפתחויות המרכזיות.`;
      const content = `${headline}\n\nבמסגרת המעקב השוטף של מערכת החדשות אחר הנושא, מדווח כי גורמים בכירים מעורבים בקידום היוזמה. הציבור מוזמן להתעדכן בעמוד זה.`;

      const articleId = new mongoose.Types.ObjectId();

      // Pre-calculate view buckets
      const bucketCount = Math.floor(Math.random() * 12) + 1;
      const views = [];
      let total = 0;
      for (let b = bucketCount; b >= 0; b--) {
        const bucketTime = new Date(now - b * ONE_HOUR);
        bucketTime.setMinutes(0, 0, 0);
        const count = Math.floor(Math.random() * 80) + 5;
        views.push({ timestamp: bucketTime, count });
        total += count;
      }

      viewStatsToInsert.push({
        articleId,
        views,
        totalViews: total
      });

      articlesToInsert.push({
        _id: articleId,
        authorId: author._id,
        category: cat,
        status: 'Published',
        publicVersion: {
          title,
          summary,
          snippet: summary,
          content,
          imageUrl: rand(SAMPLE_IMAGES),
          category: cat,
          publishedAt: pubDate
        },
        draftVersion: {
          title,
          summary,
          snippet: summary,
          content,
          imageUrl: rand(SAMPLE_IMAGES),
          category: cat,
          updatedAt: pubDate
        },
        publishHistory: [pubDate],
        totalViews: total,
        createdAt: pubDate,
        updatedAt: pubDate
      });
    }

    // C. 48 Articles in "Pending" status (Awaiting editor review)
    for (let i = 0; i < 48; i++) {
      const cat = rand(CATEGORIES);
      const headline = rand(HEADLINES[cat]);
      const author = rand(reporters);
      const hoursAgo = Math.floor(Math.random() * 48) + 1;
      const draftDate = new Date(now - hoursAgo * ONE_HOUR);

      const title = `[ממתין לאישור] ${headline}`;
      const summary = `טיוטת כתבה שהוגשה על ידי ${author.fullName} וממתינה לאישור עורך.`;
      const content = `טיוטה שהוגשה לבדיקה: ${headline}\n\nכתב: ${author.fullName}. הכתבה הושלמה ונשלחה לאישור.`;

      articlesToInsert.push({
        authorId: author._id,
        category: cat,
        status: 'Pending',
        draftVersion: {
          title,
          summary,
          snippet: summary,
          content,
          imageUrl: rand(SAMPLE_IMAGES),
          category: cat,
          updatedAt: draftDate
        },
        publicVersion: {},
        publishHistory: [],
        totalViews: 0,
        createdAt: draftDate,
        updatedAt: draftDate
      });
    }

    // D. 45 Articles in "Draft" status (Reporter work in progress)
    for (let i = 0; i < 45; i++) {
      const cat = rand(CATEGORIES);
      const headline = rand(HEADLINES[cat]);
      const author = rand(reporters);
      const hoursAgo = Math.floor(Math.random() * 24);
      const draftDate = new Date(now - hoursAgo * ONE_HOUR);

      const title = `טיוטה בעבודה: ${headline}`;
      const summary = `כתבה בתהליך עריכה שוטף על ידי ${author.fullName}.`;
      const content = `עבודה שוטפת: ${headline}\n\nהערות אישיות: להרחיב על הרקע ולצרף תמונות נוספות.`;

      articlesToInsert.push({
        authorId: author._id,
        category: cat,
        status: 'Draft',
        draftVersion: {
          title,
          summary,
          snippet: summary,
          content,
          imageUrl: rand(SAMPLE_IMAGES),
          category: cat,
          updatedAt: draftDate
        },
        publicVersion: {},
        publishHistory: [],
        totalViews: 0,
        createdAt: draftDate,
        updatedAt: draftDate
      });
    }

    // E. 30 Articles in "Returned" status (Returned for corrections with editor notes)
    const SAMPLE_EDITOR_NOTES = [
      'נא לאמת את המקורות ולהוסיף ציטוט ישיר של הדובר הרשמי.',
      'הכותרת מעט מטעה - יש לנסח כותרת מדויקת ועובדתית יותר.',
      'חסר פירוט על ההשלכות התקציביות, אנא הוסף נתונים מהדו"ח.',
      'נא לתקן שגיאות הקלדה בפסקה השנייה ולצרף תמונה באיכות גבוהה יותר.'
    ];

    for (let i = 0; i < 30; i++) {
      const cat = rand(CATEGORIES);
      const headline = rand(HEADLINES[cat]);
      const author = rand(reporters);
      const hoursAgo = Math.floor(Math.random() * 36) + 2;
      const draftDate = new Date(now - hoursAgo * ONE_HOUR);

      const title = `[הוחזר לתיקונים] ${headline}`;
      const summary = `כתבה שהוחזרה לכתב לצורך ביצוע תיקונים והבהרות.`;
      const content = `${headline}\n\nתוכן ראשוני שנבדק על ידי עורך ודורש השלמות.`;

      articlesToInsert.push({
        authorId: author._id,
        category: cat,
        status: 'Returned',
        draftVersion: {
          title,
          summary,
          snippet: summary,
          content,
          imageUrl: rand(SAMPLE_IMAGES),
          category: cat,
          updatedAt: draftDate
        },
        publicVersion: {},
        editorNote: rand(SAMPLE_EDITOR_NOTES),
        publishHistory: [],
        totalViews: 0,
        createdAt: draftDate,
        updatedAt: draftDate
      });
    }

    console.log(`Saving ${articlesToInsert.length} articles to MongoDB via bulk insert...`);
    const savedArticles = await Article.insertMany(articlesToInsert);
    console.log(`Seeded ${savedArticles.length} articles`);

    // 3. Insert Pre-Calculated ViewStats in single bulk operation
    console.log(`Saving ${viewStatsToInsert.length} ViewStats records via bulk insert...`);
    await ViewStats.insertMany(viewStatsToInsert);
    console.log(`Seeded view data for ${viewStatsToInsert.length} articles`);

    // 4. Generate Comments
    console.log('Seeding comments...');
    const commentsToInsert = [];
    const sampleIps = ['203.0.113.195', '198.51.100.44', '192.0.2.89', '82.166.12.4', '109.64.33.12'];
    const sampleAuthors = ['יוסי לוי', 'מיכל כהן', 'אלון שחר', 'רונית גולן', 'דן פרידמן', 'אורית לביא'];
    const publishedArticles = savedArticles.filter(a => a.status === 'Published');

    for (let i = 0; i < 250; i++) {
      const art = rand(publishedArticles);
      commentsToInsert.push({
        articleId: art._id,
        authorName: rand(sampleAuthors),
        content: rand(SAMPLE_COMMENTS),
        ipAddress: rand(sampleIps),
        deviceId: `seeded_dev_${i % 20}`,
        createdAt: new Date(now - Math.floor(Math.random() * 10 * ONE_DAY))
      });
    }

    await Comment.insertMany(commentsToInsert);
    console.log(`Seeded ${commentsToInsert.length} comments`);

    console.log('\n======================================================');
    console.log('Seeding complete');
    console.log(`   Total Articles: ${savedArticles.length}`);
    console.log(`     - Published:  ${savedArticles.filter(a => a.status === 'Published').length}`);
    console.log(`     - Pending:    ${savedArticles.filter(a => a.status === 'Pending').length}`);
    console.log(`     - Draft:      ${savedArticles.filter(a => a.status === 'Draft').length}`);
    console.log(`     - Returned:   ${savedArticles.filter(a => a.status === 'Returned').length}`);
    console.log(`   Total Users:    ${reporters.length + 1} (Editor: editor, Reporters: reporter1..5)`);
    console.log(`   Total Comments: ${commentsToInsert.length}`);
    console.log(`   ViewStats:      ${viewStatsToInsert.length} records with multi-update trend markers`);
    console.log('======================================================\n');

    if (ownConnection) {
      await mongoose.disconnect();
    }
  } catch (error) {
    console.error('Seeding failed:', error);
    if (ownConnection && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
