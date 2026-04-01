import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('frontend shell', () => {
  it('renders', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'LocalTube - Local Video Library' })
    ).toBeInTheDocument();
  });
});
