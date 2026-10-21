"""User-facing reply for the model's contextual scope decision."""
SCOPE_REPLY = 'Saya membantu menganalisis data pada dashboard ini. Tanyakan penjualan, HPP, laba kotor, tren, atau data Excel Anda.'


def scope_reply(model):
    return {'answer': SCOPE_REPLY, 'suggested_filters': None, 'model': model, 'scope': 'out_of_scope'}
