export default {
  fetch(request) {
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.hostname = 'boplet.app';
    target.port = '';
    return Response.redirect(target.href, 308);
  }
};
