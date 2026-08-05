from __future__ import annotations

import hashlib
import html
import json
import os
import zipfile
from datetime import datetime
from pathlib import Path

import requests
from weasyprint import HTML

URL = os.environ["EXPORT_URL"]
OUT = Path("legal_export_output")
OUT.mkdir(exist_ok=True)

CSS = r"""
@font-face { font-family: NotoArabic; src: url(file:///usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf); }
@font-face { font-family: NotoArabic; src: url(file:///usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf); font-weight:700; }
@page {
  size: A4 landscape;
  margin: 9mm 7mm 12mm 7mm;
  @bottom-center {
    content: "مستخرج من سجلات نظام Delight — الصفحة " counter(page) " من " counter(pages);
    font-family: NotoArabic; font-size: 7pt; color: #4b5563;
    border-top: .3pt solid #d1d5db; padding-top: 2mm;
  }
}
* { box-sizing: border-box; }
body { font-family: NotoArabic, sans-serif; direction: rtl; color:#111827; margin:0; font-size:7pt; }
h1,h2,p { margin:0; }
.company { text-align:center; font-weight:700; font-size:13pt; }
.title { text-align:center; font-weight:700; font-size:12pt; margin-top:1mm; }
.meta { text-align:center; color:#374151; font-size:7.5pt; line-height:1.55; margin-top:1mm; }
.section { font-weight:700; font-size:9pt; margin:4mm 0 2mm; }
table { width:100%; border-collapse:collapse; table-layout:fixed; direction:rtl; margin-top:3mm; }
thead { display:table-header-group; }
tr { break-inside:avoid; }
th { background:#1f2937; color:white; font-weight:700; text-align:center; border:.35pt solid #9ca3af; padding:1.4mm .7mm; line-height:1.2; }
td { border:.3pt solid #9ca3af; padding:1.05mm .65mm; vertical-align:middle; text-align:center; line-height:1.25; overflow-wrap:anywhere; }
tbody tr:nth-child(even) { background:#f3f4f6; }
.money,.num,.ltr { direction:ltr; unicode-bidi:embed; text-align:center; }
.left { text-align:left; direction:ltr; }
.small { font-size:6pt; }
.pagebreak { break-before:page; }
"""


def e(v):
    return html.escape("—" if v is None or v == "" else str(v))


def money(v):
    try: return f"{float(v):,.2f}"
    except Exception: return e(v)


def qty(v):
    try:
        n=float(v)
        return f"{int(n):,}" if n.is_integer() else f"{n:,.3f}".rstrip("0").rstrip(".")
    except Exception: return e(v)


def dt(v):
    if not v: return "—"
    try: return datetime.strptime(str(v)[:19], "%Y-%m-%d %H:%M:%S").strftime("%d/%m/%Y %H:%M:%S")
    except Exception: return e(v)


def day(v):
    if not v: return "—"
    try: return datetime.strptime(str(v)[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception: return e(v)


def method(v):
    return {"cash":"نقدي","instapay":"إنستا باي","mobile_wallet":"محفظة إلكترونية","bank_transfer":"تحويل بنكي"}.get(str(v), e(v))


def stat(v):
    return {"confirmed":"معتمد","pending":"قيد المراجعة","rejected":"مرفوض","approved":"معتمد","cancelled":"ملغي"}.get(str(v), e(v))


def ctype(v):
    return {"collection":"تحصيل","settlement":"تسوية / توريد","expense":"مصروف","load":"تحميل عهدة"}.get(str(v), e(v))


def rtype(v):
    return {"payment_receipt":"إيصال دفع","sales_order":"أمر بيع","expense":"مصروف","vault":"خزينة","transfer":"تحويل مخزني"}.get(str(v), e(v))


def stype(v):
    return {"out":"صرف / خروج","transfer_in":"تحويل وارد","transfer_out":"تحويل صادر","in":"إضافة / دخول"}.get(str(v), e(v))


def atype(v):
    return {"punch_in":"حضور","punch_out":"انصراف","check_in":"حضور","check_out":"انصراف"}.get(str(v), e(v))


def header(title, count, data):
    p=data.get("period",{})
    emp=data.get("employee",{})
    extracted=datetime.now().strftime("%d/%m/%Y %H:%M")
    return f'''<div class="company">شركة ديلايت</div>
<div class="title">{e(title)}</div>
<div class="meta">الموظف: {e(emp.get('name','كريم شيتوس'))} — الرقم الوظيفي: {e(emp.get('employee_no','EMP-00001'))} — الفترة: {day(p.get('start'))} إلى {day(p.get('end'))}<br>عدد السجلات: {count:,} — تاريخ الاستخراج: {extracted} بتوقيت القاهرة</div>'''


def table(headers, rows, widths=None, classes=None):
    colgroup=""
    if widths:
        colgroup="<colgroup>"+"".join(f'<col style="width:{w}%">' for w in widths)+"</colgroup>"
    out=["<table>",colgroup,"<thead><tr>"]
    out.extend(f"<th>{e(h)}</th>" for h in headers)
    out.append("</tr></thead><tbody>")
    for row in rows:
        out.append("<tr>")
        for i,val in enumerate(row):
            cls=(classes or {}).get(i,"")
            out.append(f'<td class="{cls}">{val}</td>')
        out.append("</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def write_pdf(name, title, body):
    path=OUT/name
    doc=f'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>{CSS}</style><title>{e(title)}</title></head><body>{body}</body></html>'
    HTML(string=doc, base_url="/").write_pdf(path)
    return path


def main():
    res=requests.get(URL,timeout=180)
    res.raise_for_status()
    raw=res.content
    data=res.json()
    files=[]

    rec=data.get("receipts",[])
    rows=[]
    for i,r in enumerate(rec,1):
        rows.append([e(i),e(dt(r.get("date_time"))),e(r.get("receipt_no")),e(r.get("customer_code")),e(r.get("customer_name")),e(money(r.get("amount"))),e(method(r.get("payment_method"))),e(r.get("route")),e(stat(r.get("status"))),e(r.get("sales_order_no"))])
    body=header("كشف تفصيلي بإيصالات الدفع المنفذة بواسطة كريم شيتوس",len(rows),data)+table(["م","التاريخ والوقت","رقم الإيصال","كود العميل","اسم العميل","المبلغ (ج.م)","طريقة الدفع","مسار التحصيل","الحالة","أمر البيع"],rows,[3,11,9,7,17,8,8,17,8,12],{0:"num",1:"ltr",2:"ltr",3:"ltr",5:"money",9:"ltr"})
    files.append(write_pdf("01_كشف_إيصالات_الدفع_كريم_شيتوس.pdf","كشف إيصالات الدفع",body))

    cust=data.get("custody",[])
    rows=[]
    for i,r in enumerate(cust,1):
        rows.append([e(i),e(dt(r.get("date_time"))),e(ctype(r.get("movement_type"))),e(money(r.get("amount"))),e(money(r.get("balance_after"))),e(rtype(r.get("reference_type"))),e(r.get("reference_no")),e(r.get("customer_code")),e(r.get("customer_name")),e(r.get("vault_name")),e(r.get("description")),e(r.get("created_by"))])
    body=header("كشف حركة العهدة النقدية التفصيلي — كريم شيتوس",len(rows),data)+table(["م","التاريخ والوقت","نوع الحركة","المبلغ","الرصيد بعد الحركة","نوع المرجع","رقم المرجع","كود العميل","اسم العميل","الخزينة","البيان","منشئ الحركة"],rows,[3,10,8,7,8,8,9,7,14,10,10,6],{0:"num",1:"ltr",3:"money",4:"money",6:"ltr",7:"ltr"})
    files.append(write_pdf("02_كشف_حركة_العهدة_النقدية_كريم_شيتوس.pdf","كشف حركة العهدة النقدية",body))

    stock=data.get("stock",[])
    rows=[]
    for i,r in enumerate(stock,1):
        party=" / ".join(x for x in [r.get("customer_code"),r.get("customer_name")] if x)
        if not party and (r.get("from_warehouse") or r.get("to_warehouse")):
            party=f"من: {r.get('from_warehouse') or '—'} | إلى: {r.get('to_warehouse') or '—'}"
        rows.append([e(i),e(dt(r.get("date_time"))),e(stype(r.get("movement_type"))),e(r.get("product_code")),e(r.get("product_name")),e(r.get("unit")),e(qty(r.get("quantity"))),e(qty(r.get("before_qty"))),e(qty(r.get("after_qty"))),e(money(r.get("unit_cost"))),e(rtype(r.get("reference_type"))),e(r.get("reference_no")),e(party),e(r.get("notes")),e(r.get("created_by"))])
    body=header("كشف حركة عهدة البضاعة بمخزن كريم شيتوس",len(rows),data)+'<div class="meta">المخزن: مخزن كريم شيتوس</div>'+table(["م","التاريخ والوقت","نوع الحركة","كود الصنف","اسم الصنف","الوحدة","الكمية","قبل","بعد","تكلفة الوحدة","نوع المرجع","رقم المرجع","العميل / جهة التحويل","ملاحظات","منشئ الحركة"],rows,[2.5,8.5,6.5,6,12,5,5,5,5,6.5,7,8,12,7,4.5],{0:"num",1:"ltr",3:"ltr",6:"num",7:"num",8:"num",9:"money",11:"ltr"})
    files.append(write_pdf("03_كشف_حركة_مخزن_كريم_شيتوس.pdf","كشف حركة عهدة البضاعة",body))

    logs=data.get("attendance_logs",[])
    rows=[]
    for i,r in enumerate(logs,1):
        device=r.get("device_info")
        if isinstance(device,(dict,list)): device=json.dumps(device,ensure_ascii=False,separators=(",",":"))
        rows.append([e(i),e(dt(r.get("event_time"))),e(atype(r.get("log_type"))),e(r.get("location_name")),e(r.get("latitude")),e(r.get("longitude")),e(money(r.get("gps_accuracy"))),e("نعم" if r.get("offline_sync") else "لا"),e("نعم" if r.get("requires_review") else "لا"),e(device)])
    body=header("كشف الحضور والانصراف الخام — كريم شيتوس",len(rows),data)+'<div class="section">أولًا: سجل البصمات والحركات الخام</div>'+table(["م","التاريخ والوقت","الحركة","موقع العمل","خط العرض","خط الطول","دقة GPS","مزامنة دون اتصال","يحتاج مراجعة","بيانات الجهاز"],rows,[3,12,7,14,10,10,8,10,9,17],{0:"num",1:"ltr",4:"ltr",5:"ltr",6:"num",9:"small"})
    days=data.get("attendance_days",[])
    rows=[]
    for i,r in enumerate(days,1):
        rows.append([e(i),e(day(r.get("work_date"))),e(dt(r.get("punch_in"))),e(dt(r.get("punch_out"))),e(r.get("status")),e(r.get("checkout_status")),e(r.get("late_minutes") or 0),e(r.get("early_leave_minutes") or 0),e(r.get("overtime_minutes") or 0),e(money(r.get("effective_hours"))),e("نعم" if r.get("auto_checkout") else "لا"),e(r.get("review_status")),e(r.get("notes"))])
    body+='<div class="pagebreak section">ثانيًا: السجل اليومي للنظام</div>'+table(["م","تاريخ العمل","وقت الحضور","وقت الانصراف","الحالة","حالة الانصراف","تأخير بالدقائق","انصراف مبكر","إضافي","الساعات الفعلية","انصراف آلي","حالة المراجعة","ملاحظات"],rows,[3,7,11,11,7,8,7,7,6,8,7,8,10],{0:"num",1:"ltr",2:"ltr",3:"ltr",6:"num",7:"num",8:"num",9:"num"})
    files.append(write_pdf("04_كشف_الحضور_والانصراف_كريم_شيتوس.pdf","كشف الحضور والانصراف",body))

    credit=data.get("credit_daily",[])
    rows=[]
    for i,r in enumerate(credit,1):
        rows.append([e(i),e(day(r.get("date"))),e(money(r.get("opening_balance"))),e(money(r.get("debit_movements"))),e(money(r.get("credit_movements"))),e(money(r.get("net_change"))),e(money(r.get("closing_balance"))),e(r.get("movement_count") or 0)])
    body=header("كشف التطور اليومي للائتمان الخاص بعملاء كريم شيتوس",len(rows),data)+table(["م","التاريخ","رصيد أول اليوم","حركات مدينة / زيادة الائتمان","حركات دائنة / سداد أو تخفيض","صافي التغير","رصيد آخر اليوم","عدد الحركات"],rows,[4,11,14,19,19,14,14,5],{0:"num",1:"ltr",2:"money",3:"money",4:"money",5:"money",6:"money",7:"num"})
    files.append(write_pdf("05_كشف_تطور_الائتمان_عملاء_كريم_شيتوس.pdf","كشف تطور الائتمان",body))

    lines=["DELIGHT — FILE INTEGRITY MANIFEST","Employee: Kareem Shetos / EMP-00001","Period: 2026-04-01 through 2026-07-15",f"Generated UTC: {datetime.utcnow().isoformat(timespec='seconds')}Z",f"Source JSON SHA-256: {hashlib.sha256(raw).hexdigest()}",""]
    for p in files: lines.append(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}")
    manifest=OUT/"06_SHA256_بصمات_سلامة_الملفات.txt"
    manifest.write_text("\n".join(lines)+"\n",encoding="utf-8")
    files.append(manifest)
    zip_path=OUT/"مستندات_كريم_شيتوس_للنيابة.zip"
    with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in files: z.write(p,p.name)
    summary={"receipts":len(rec),"custody":len(cust),"stock":len(stock),"attendance_logs":len(logs),"attendance_days":len(days),"credit_days":len(credit),"files":[p.name for p in files]+[zip_path.name],"zip_sha256":hashlib.sha256(zip_path.read_bytes()).hexdigest()}
    (OUT/"build_summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=="__main__": main()
