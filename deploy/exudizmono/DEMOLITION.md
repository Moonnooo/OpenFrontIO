# Building demolition refunds

Voluntary building demolition returns 50% of the gold actually deducted for construction and upgrades, rounded up to the next gold unit. The existing demolition delay and cooldown remain. Refunds are credited only after successful demolition, never for combat destruction or railway removal.

Ownership changes reset investment, so captured structures do not reimburse gold paid by another player. Upgrades paid by the new owner count toward their refund. Free structures have no refund. Unit snapshot v2 persists investment; v1 snapshots migrate with zero recorded investment because their historical costs are unknown.

Deployment: build deploy/exudizmono/Dockerfile.demolition-refund using the previous rail-delete image, then deploy the new image to both services with matching generated HTML and GIT_COMMIT.
