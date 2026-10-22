"""Render numeric evidence on the server; the language model only selects references."""
from decimal import Decimal, InvalidOperation
import re

MONEY = {'sales', 'hpp', 'gross', 'price', 'unit_cost', 'amount', 'total',
         'current_sales', 'previous_sales', 'change', 'absolute_change', 'gross_change', 'absolute_gross_change', 'current', 'previous', 'backtest_mae'}
PERCENT = {'gross_margin', 'margin', 'contribution', 'growth', 'absolute_growth', 'gross_growth'}
MONTHS = ('Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
          'Agustus', 'September', 'Oktober', 'November', 'Desember')
TOKEN = re.compile(r'\[\[([^\[\]]+)\]\]')


def number(value):
    value = Decimal(str(value))
    if not value.is_finite():
        raise ValueError('Non-finite evidence')
    text = f'{value:,.2f}'.rstrip('0').rstrip('.')
    return text.replace(',', '_').replace('.', ',').replace('_', '.')


def facts_for(context):
    facts = {}
    def visit(value, path, key):
        if isinstance(value, dict):
            for k, v in value.items():
                visit(v, f'{path}.{k}' if path else k, k)
        elif isinstance(value, list):
            for i, v in enumerate(value):
                visit(v, f'{path}.{i}', key)
        elif value is not None and not isinstance(value, bool):
            text = str(value)
            if key == 'date' and re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
                year, month, day = text.split('-')
                facts[path] = f'{int(day)} {MONTHS[int(month)-1]} {year}'
                return
            if re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', text):
                year, month = text.split('-')
                facts[path] = f'{MONTHS[int(month)-1]} {year}'
                return
            try:
                formatted = number(value)
            except (InvalidOperation, ValueError):
                # Dimension names with digits also need a safe reference.
                if key in {'product', 'location', 'supplier', 'sheet', 'source_name', 'detail'}:
                    facts[path] = text
                return
            if path == 'filters.year':
                formatted = str(int(value))
            if key in PERCENT:
                formatted += '%'
            elif key in MONEY and not path.startswith(('filters.', 'rows.')):
                formatted = 'Rp' + formatted
            facts[path] = formatted
    visit(context, '', '')
    return facts


def render_answer(answer, facts):
    # Normalize an equivalent reference syntax, but only for known evidence.
    answer = re.sub(r'\{\{([^{}]+)\}\}', lambda m: '[[' + m.group(1) + ']]' if m.group(1) in facts else m.group(), answer)
    answer = re.sub(r'\[\[([^\[\]]+)\]\]\s*%', lambda m: '[[' + m.group(1) + ']]' if facts.get(m.group(1), '').endswith('%') else m.group(), answer)
    # Accept exact server-formatted literals too; models sometimes spell out dates
    # or percentages instead of references. Never infer a conversion or new value.
    literals = {value: key for key, value in facts.items() if re.search(r'\d', value)}
    if literals:
        exact = re.compile(r'(?<![\w.,%+-])(?:' + '|'.join(re.escape(v) for v in sorted(literals, key=len, reverse=True)) + r')(?![\w%+-]|[.,]\d)')
        parts = re.split(r'(\[\[[^\[\]]+\]\])', answer)
        answer = ''.join(part if TOKEN.fullmatch(part) else exact.sub(lambda m: '[[' + literals[m.group()] + ']]', part) for part in parts)
    references = TOKEN.findall(answer)
    if any(ref not in facts for ref in references):
        raise ValueError('Unknown evidence reference')
    remaining = TOKEN.sub('', answer)
    if re.search(r'\d|\[\[|\]\]', remaining):
        raise ValueError('Numbers must use evidence references')
    # A reference already includes its currency and scale; do not let prose rescale it.
    for match in TOKEN.finditer(answer):
        if facts[match.group(1)].startswith('Rp'):
            before, after = answer[:match.start()], answer[match.end():]
            if re.search(r'(?:Rp|rupiah)\s*\**\s*$', before, re.I) or re.match(
                r'\s*\**\s*(?:ribu|juta|miliar|milyar|triliun|rupiah|persen|%|thousand|million|billion)\b', after, re.I
            ):
                raise ValueError('Currency scale must not be changed')
    rendered = TOKEN.sub(lambda match: facts[match.group(1)], answer)
    # Period references already include the month: remove only adjacent identical names.
    month_names = '|'.join(MONTHS)
    return re.sub(r'\b(' + month_names + r')(?:[ \t]+\1)+\b', r'\1', rendered, flags=re.I)
