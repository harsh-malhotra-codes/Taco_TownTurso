import { API_URL } from './config.js';
import { updateCartBadge } from './cart-utils.js';

document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();
});
