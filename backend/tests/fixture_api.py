"""Local browser-test storage only. Never used by the production ASGI entrypoint."""
from uuid import uuid4
from fastapi import Depends, HTTPException
from fastapi.responses import Response
from app.main import app
from app.services.database import authenticated, bearer, AuthToken
from app.routes import dashboard, uploads
from app.services import sources

state = {'refraksi_sales': [], 'refraksi_expenses': [], 'refraksi_sources': [], 'writes': 0}

async def test_auth(credentials=Depends(bearer)):
    if not credentials or credentials.credentials != 'test-access':
        raise HTTPException(401, 'Silakan masuk terlebih dahulu.')
    token = AuthToken('test-access')
    token.user_id = 'browser-test-user'
    return token

async def all_records(token, table):
    return list(state[table])

async def database(token, method, table, *, body=None, params=None, **kwargs):
    rows = state[table]
    if method == 'GET':
        expression = (params or {}).get('id', '')
        if expression.startswith('in.('):
            ids = set(expression[4:-1].split(','))
            return [{'id': row['id']} for row in rows if row['id'] in ids]
        if expression.startswith('eq.'):
            return [row for row in rows if row['id'] == expression[3:]]
        return list(rows)
    expression = (params or {}).get('id', '')
    selected = [row for row in rows if not expression or (row['id'] in expression[4:-1].split(',') if expression.startswith('in.(') else row['id'] == expression[3:])]
    if method == 'POST':
        entries = body if isinstance(body, list) else [body]
        if any(row.get('id') in {item['id'] for item in rows} for row in entries):
            raise HTTPException(409, 'Data sudah pernah diimpor atau ID sudah digunakan.')
        entries = [{**row, 'id': row.get('id', str(uuid4()))} for row in entries]
        rows.extend(entries)
        state['writes'] += 1
        return entries
    if method == 'PATCH':
        for row in selected:
            row.update(body)
    if method == 'DELETE':
        state[table] = [row for row in rows if row not in selected]
    state['writes'] += 1
    return selected

app.dependency_overrides[authenticated] = test_auth
dashboard.all_records = all_records
from app.routes import smart
smart.all_records = all_records
dashboard.database = database
uploads.database = database
sources.all_records = all_records

@app.post('/test/reset')
async def reset():
    state.update(refraksi_sales=[], refraksi_expenses=[], refraksi_sources=[], writes=0)
    return {'ok': True}

@app.get('/test/state')
async def test_state():
    return state


@app.get('/test/report-file')
async def report_file(precision: bool = False):
    from test_excel_reports import workbook
    return Response(workbook(cost=1.23 if precision else 2000), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.get('/test/source-file')
async def source_file(kind: str = 'recap'):
    from openpyxl import Workbook
    from io import BytesIO
    wb = Workbook()
    ws = wb.active
    if kind == 'master':
        ws.title = 'master product'
        ws.append(['SKU FINAL', 'UPC', 'DESCRIPTION FINAL', 'DEPT FINAL'])
        ws.append(['001', '123', 'Produk A', 'Food'])
    elif kind == 'claim':
        ws.title = 'DETAIL RAFRAKSI JANUARI'
        ws.append(['CODE SUPPLIER', 'SUPPLIER NAME', 'Sum of SALES QTY PROMO', 'Sum of RAFAKSI2'])
        ws.append(['S1', 'Supplier A', 3, 15000])
    else:
        ws.title = 'DETAIL SALES'
        ws.append(['STORE', 'STORE_NAME', 'SKU', 'SKU_DESC', 'QTY_SALES', 'SALES_VALUE', 'REGION'])
        ws.append([1, 'Toko A', '001', 'Produk A', 3, 100, 'Bali'])
        summary = wb.create_sheet('SUMMARY')
        summary.append(['Grand Total', 100])
    stream = BytesIO()
    wb.save(stream)
    return Response(stream.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
