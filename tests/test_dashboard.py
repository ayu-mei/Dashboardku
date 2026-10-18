import tempfile
import unittest
from pathlib import Path
from app import app, read_data, summarize


class DashboardTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        app.config.update(TESTING=True, DATA_FILE=Path(self.directory.name) / 'test.xlsx')
        self.client = app.test_client()

    def tearDown(self):
        self.directory.cleanup()

    def test_crud_finance_and_persistence(self):
        sale = dict(date='2026-01-10', customer='Ani', product='Lensa', quantity=2, price=500000, unit_cost=300000)
        self.assertEqual(self.client.post('/api/sales', json=sale).status_code, 200)
        self.assertEqual(self.client.post('/api/expenses', json=dict(date='2026-01-12', description='Sewa', amount=100000)).status_code, 200)
        result = self.client.get('/api/dashboard?year=2026').json
        self.assertEqual(result['metrics'], dict(sales=1000000, hpp=600000, gross=400000, gross_margin=40, operational=100000, net=300000, net_margin=30))
        self.assertEqual(result['monthly'][0], 1000000)
        self.assertEqual(read_data()['Sales'][0]['customer'], 'Ani')
        sale_id = result['sales'][0]['id']
        sale['quantity'] = 1
        self.assertEqual(self.client.put('/api/sales/' + sale_id, json=sale).status_code, 200)
        self.assertEqual(self.client.get('/api/dashboard?year=2026').json['metrics']['net'], 100000)
        self.assertEqual(self.client.delete('/api/sales/' + sale_id).status_code, 200)
        empty = self.client.get('/api/dashboard?year=2026').json['metrics']
        self.assertIsNone(empty['net_margin'])
        self.assertEqual(empty['net'], -100000)
        expense_id = result['expenses'][0]['id']
        self.assertEqual(self.client.put('/api/expenses/' + expense_id, json=dict(date='2026-02-01', description='Listrik', amount=50000)).status_code, 200)
        self.assertEqual(self.client.delete('/api/expenses/' + expense_id).status_code, 200)
        self.assertEqual(self.client.get('/download').status_code, 200)
        self.assertEqual(self.client.get('/').status_code, 200)

    def test_invalid_and_year_filter(self):
        sale = dict(date='2026-01-10', customer='Ani', product='Lensa', quantity=1, price='0.10', unit_cost='0.03')
        self.client.post('/api/sales', json=sale)
        self.assertEqual(self.client.get('/api/dashboard?year=2025').json['metrics']['sales'], 0)
        self.assertEqual(self.client.get('/api/dashboard?year=2026').json['metrics']['gross'], .07)
        for bad in [-1, 'NaN', 'Infinity', '0.001']:
            sale['price'] = bad
            self.assertEqual(self.client.post('/api/sales', json=sale).status_code, 400)
        self.assertEqual(self.client.delete('/api/sales/missing').status_code, 404)


if __name__ == '__main__':
    unittest.main()
