describe('Checkout Flow', () => {
  it('completes the checkout process successfully', () => {
    cy.visit('/cart');
    cy.get('button').contains('Place Order').click();

    cy.url().should('include', '/orders');
    cy.contains('Order placed successfully!');
  });
});