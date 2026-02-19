-- Create view vw_engineer_stock_alert_by_area

CREATE OR REPLACE VIEW vw_engineer_stock_alert_by_area AS
SELECT
    p.location AS area_group,
    p.id AS engineer_id,
    p.name AS engineer_name,
    -- Empty parts: 1 if user has NO stock at all (total_qty is 0), else 0.
    CASE WHEN COALESCE(SUM(es.quantity), 0) = 0 THEN 1 ELSE 0 END AS empty_parts,
    -- Low parts: Parts with quantity > 0 but <= 5
    COUNT(CASE WHEN es.quantity > 0 AND es.quantity <= 5 THEN 1 END) AS low_parts,
    COALESCE(SUM(es.quantity), 0) AS total_qty
FROM
    profiles p
LEFT JOIN
    engineer_stock es ON p.id = es.engineer_id
WHERE
    p.role = 'engineer'
GROUP BY
    p.location, p.id, p.name;

-- Grant access to the view
GRANT SELECT ON vw_engineer_stock_alert_by_area TO authenticated;
GRANT SELECT ON vw_engineer_stock_alert_by_area TO service_role;
