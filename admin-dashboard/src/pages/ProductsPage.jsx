import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Card from '../components/Card';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { formatKes } from '../utils/formatters';

const emptyForm = { name: '', sku: '', defaultPrice: '', category: '' };

function productPayload(form) {
  return { ...form, defaultPrice: Number(form.defaultPrice) };
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [edit, setEdit] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await client.get('/products');
      setProducts(data.products || []);
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => setError('Failed to load products'));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.post('/products', productPayload(form));
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create product');
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.patch(`/products/${editing.id}`, productPayload(edit));
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update product');
    }
  }

  async function toggle(product) {
    setError(null);
    try {
      await client.patch(`/products/${product.id}/status`, { active: !(product.active !== false) });
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update product status');
    }
  }

  function beginEdit(product) {
    setEditing(product);
    setEdit({
      name: product.name,
      sku: product.sku,
      defaultPrice: String(product.defaultPrice),
      category: product.category,
    });
  }

  const fields = [
    ['name', 'Name', 'text'],
    ['sku', 'SKU', 'text'],
    ['defaultPrice', 'Default price (KES)', 'number'],
    ['category', 'Category', 'text'],
  ];
  const productForm = (values, setValues, prefix) =>
    fields.map(([key, label, type]) => (
      <div className="field" key={key}>
        <label htmlFor={`${prefix}-product-${key}`}>{label}</label>
        <input
          id={`${prefix}-product-${key}`}
          required
          min={type === 'number' ? '0' : undefined}
          step={type === 'number' ? '0.01' : undefined}
          type={type}
          value={values[key]}
          onChange={(event) => setValues({ ...values, [key]: event.target.value })}
        />
      </div>
    ));

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CATALOG</span>
        <h1>Products</h1>
        <p className="muted">
          Maintain the field-sales catalog without removing historical sales records.
        </p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="grid-2">
        <Card title="Create product">
          <form className="form-grid" onSubmit={submit}>
            {productForm(form, setForm, 'new')}
            <Button type="submit">Create product</Button>
          </form>
        </Card>
        <Card title={`${products.length} products`}>
          {loading ? (
            <p className="muted">Loading products…</p>
          ) : products.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.sku}</td>
                      <td>{product.category}</td>
                      <td>{formatKes(product.defaultPrice)}</td>
                      <td>{product.active === false ? 'Inactive' : 'Active'}</td>
                      <td>
                        <Button variant="secondary" onClick={() => beginEdit(product)}>
                          Edit
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => toggle(product)}>
                          {product.active === false ? 'Reactivate' : 'Deactivate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No products yet"
              message="Create the first product for the sales catalog."
            />
          )}
        </Card>
      </div>
      {editing && (
        <div className="ui-card" style={{ marginTop: 18 }}>
          <h2>Edit {editing.name}</h2>
          <form className="form-grid" onSubmit={saveEdit}>
            {productForm(edit, setEdit, 'edit')}
            <div>
              <Button type="submit">Save changes</Button>{' '}
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
