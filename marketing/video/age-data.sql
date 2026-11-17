-- Age open tables and tickets so timers and KDS colours look like a real service.
update orders o set opened_at = :'vnow'::timestamptz - (v.m || ' minutes')::interval
from (values ('A1', 24), ('A2', 6), ('A6', 14), ('N2', 32), ('N4', 9), ('F2', 19)) v(label, m), dining_tables t
where o.table_id = t.id and t.label = v.label and o.status = 'OPEN';
update order_items i set fired_at = o.opened_at + interval '1 minute'
from orders o where i.order_id = o.id and o.status = 'OPEN';
update dining_tables set status_changed_at = :'vnow'::timestamptz - interval '7 minutes' where label in ('N5', 'A8', 'F1');
-- Spread today's completed bills across the morning.
update orders set opened_at = :'vnow'::timestamptz - ((s.rn * 14 + 25) || ' minutes')::interval, closed_at = :'vnow'::timestamptz - ((s.rn * 14 + 5) || ' minutes')::interval
from (select id as oid, row_number() over (order by order_number) as rn from orders
      where status = 'COMPLETED' and closed_at > :'vnow'::timestamptz - interval '1 hour') s
where orders.id = s.oid;

-- Tonight's bookings inside the dashboard's "next 4 hours" window.
update reservations set reserved_for = :'vnow'::timestamptz + interval '55 minutes' where customer_name = 'Meenakshi Sundaram';
update reservations set reserved_for = :'vnow'::timestamptz + interval '100 minutes' where customer_name = 'Arun Prakash';
