# دليل تحويل النسخ الاحتياطية

## المتطلبات
- Node.js مثبت على الجهاز
- نسخة احتياطية من النظام القديم (ملف JSON)

---

## الملفات المتاحة

| الملف | الوصف |
|-------|-------|
| `migrate-legacy-backup.js` | تحويل **كامل** (كل البيانات مع الأوامر والفواتير) |
| `migrate-fresh-start.js` | تحويل **البيانات الأساسية فقط** (مخزون + أطراف + خزائن) |

---

## خطوات التحويل

### 1. نسخ ملف الباك اب
ضع ملف الباك اب القديم في المجلد الرئيسي للمشروع:
```
new factory sys/
├── your-backup-file.json  ← هنا
├── scripts/
│   ├── migrate-legacy-backup.js
│   └── migrate-fresh-start.js
```

### 2. تعديل مسار الملف في السكريبت

افتح السكريبت المطلوب وعدّل السطر التالي:

**للتحويل الكامل** (`migrate-legacy-backup.js` سطر 10):
```javascript
const OLD_BACKUP_PATH = path.join(__dirname, '..', 'your-backup-file.json');
```

**للبداية الجديدة** (`migrate-fresh-start.js` سطر 11):
```javascript
const OLD_BACKUP_PATH = path.join(__dirname, '..', 'your-backup-file.json');
```

### 3. تشغيل السكريبت

افتح Terminal في مجلد المشروع ونفذ:

```bash
# للتحويل الكامل (مع كل الأوامر والفواتير):
node scripts/migrate-legacy-backup.js

# للبداية الجديدة (بدون أوامر وفواتير):
node scripts/migrate-fresh-start.js
```

### 4. الملف الناتج

سيتم إنشاء ملف جديد في المجلد الرئيسي:
- **التحويل الكامل**: `migrated-backup-YYYY-MM-DD...json`
- **البداية الجديدة**: `fresh-start-YYYY-MM-DD...json`

---

## استيراد النسخة في النظام الجديد

1. افتح التطبيق وسجل الدخول
2. اذهب إلى **الإعدادات** > **النسخ الاحتياطي**
3. اختر **استعادة من ملف**
4. اختر الملف الناتج من السكريبت
5. انتظر اكتمال الاستيراد

---

## بعد الاستيراد: إعادة ضبط العدادات

إذا واجهت خطأ `409 Conflict` عند إضافة عناصر جديدة، نفذ هذا في Supabase SQL Editor:

```sql
-- تشغيل ملف reset_sequences.sql
-- أو نفذ هذه الأوامر مباشرة:

SELECT setval('raw_materials_id_seq', COALESCE((SELECT MAX(id) FROM raw_materials), 0) + 1);
SELECT setval('packaging_materials_id_seq', COALESCE((SELECT MAX(id) FROM packaging_materials), 0) + 1);
SELECT setval('semi_finished_products_id_seq', COALESCE((SELECT MAX(id) FROM semi_finished_products), 0) + 1);
SELECT setval('finished_products_id_seq', COALESCE((SELECT MAX(id) FROM finished_products), 0) + 1);
SELECT setval('production_orders_id_seq', COALESCE((SELECT MAX(id) FROM production_orders), 0) + 1);
SELECT setval('packaging_orders_id_seq', COALESCE((SELECT MAX(id) FROM packaging_orders), 0) + 1);
SELECT setval('treasuries_id_seq', COALESCE((SELECT MAX(id) FROM treasuries), 0) + 1);
SELECT setval('purchase_invoices_id_seq', COALESCE((SELECT MAX(id) FROM purchase_invoices), 0) + 1);
SELECT setval('sales_invoices_id_seq', COALESCE((SELECT MAX(id) FROM sales_invoices), 0) + 1);
```

---

## الفرق بين نوعي التحويل

| | التحويل الكامل | البداية الجديدة |
|--|---------------|-----------------|
| **المخزون (4 أنواع)** | ✅ | ✅ |
| **التركيبات والتغليف** | ✅ | ✅ |
| **العملاء والموردين** | ✅ | ✅ |
| **أرصدة الأطراف** | ✅ | ✅ |
| **الخزائن وأرصدتها** | ✅ | ✅ |
| **بنود الإيرادات/المصروفات** | ✅ | ✅ |
| **أوامر الإنتاج** | ✅ | ❌ |
| **أوامر التعبئة** | ✅ | ❌ |
| **الفواتير** | ✅ | ❌ |
| **المعاملات المالية** | ✅ | ❌ |

---

## ملاحظات مهمة

1. ⚠️ **احتفظ بنسخة من الباك اب الأصلي** قبل أي تحويل
2. ⚠️ **الاستيراد يمسح البيانات الحالية** في النظام الجديد
3. ✅ الأكواد تُولد بتنسيق النظام الجديد (RM001, PM001, SF001...)
4. ✅ التواريخ الأصلية محفوظة في كل السجلات
