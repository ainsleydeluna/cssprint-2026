# Tangkay

Tangkay ("stem" in Tagalog) helps a small florist answer "hm po?" fast: a customer's bouquet photo becomes an itemized quote priced on the florist's latest Dangwa costs.

## Language

### The shop and its flowers

**Shop**:
One florist's business in Tangkay. Every quote, receipt and stem belongs to exactly one shop, and a shop has one owner.
_Avoid_: Store, account, user

**Stem**:
One row of the shop's flower list: a flower plus its color (for example "rose, red"), the unit it is bought in, and its latest cost. Also the single flower stalk that a quote counts.
_Avoid_: Item, product, SKU, flower type

**Filler**:
A stem used to fill out a bouquet rather than be its focus: baby's breath, statice, eucalyptus, greenery. Bought and counted by the bunch, never by the stalk.
_Avoid_: Greens, extras

**Bunch**:
A tied unit of filler, bought and priced as a whole. A filler line in a quote is counted in whole bunches. On a Dangwa receipt a filler sold "per bundle" is one bunch.
_Avoid_: Bundle (for fillers), sprig

**Bundle**:
A supplier pack of a set number of stems of one main flower, such as mums. The pack price divided by the pack size gives the cost per stem.
_Avoid_: Bunch (for main flowers), pack

**Sample price**:
A placeholder cost for a stem the shop has not bought yet, shown labeled "sample" until a receipt replaces it.
_Avoid_: Default price, list price

### Costs and prices

**Receipt**:
One Dangwa purchase the florist recorded, usually from a photo of a handwritten receipt or their own buy list. It has a purchase date and one line per stem bought.
_Avoid_: Invoice, buy list (as a separate thing)

**Stock batch**:
One line of a receipt: a stem, how many units were bought, what was paid, and the purchase date. Each batch is kept, so costs have a history.
_Avoid_: Inventory, stock level, purchase line

**Latest cost**:
What a stem costs the shop right now: its newest stock batch by purchase date (if two share a date, the one entered last), or the sample price if the shop has never bought it. Tangkay knows the florist's last receipt, not today's market.
_Avoid_: Today's cost, current price, market price

**Recipe**:
The list of stems and fillers, with counts, that makes up one bouquet. A quote is a priced recipe.
_Avoid_: Bill of materials, ingredients, composition

**Count range**:
The AI's low and high estimate of how many stems of one flower a bouquet holds: the heads it can see, widened for ones likely hidden. The quote line starts at the middle of the range, rounded up.
_Avoid_: Estimate, guess

**Recipe cost**:
What the stems and fillers in a recipe cost the shop at their latest costs. Fees are not part of it.
_Avoid_: Cost of goods, base cost

**Fee**:
A fixed amount the shop adds to every bouquet on top of recipe cost: the wrap fee and the labor fee. Markup does not apply to fees.
_Avoid_: Charge, surcharge

**Markup**:
The percentage the shop adds on top of recipe cost to set its price.
_Avoid_: Margin, profit percent

**Price**:
What the customer is quoted for a bouquet: recipe cost plus markup, plus fees, rounded up to the nearest ten pesos.
_Avoid_: Total, amount, cost

**Margin**:
The share of a quote's price that is profit once the recipe is costed at the latest costs. Markup is what the shop adds; margin is what it keeps.
_Avoid_: Markup, profit percent

**Minimum margin**:
The smallest margin a shop is willing to earn on a quote. A shop setting.
_Avoid_: Margin threshold, floor

### Quotes

**Inquiry**:
One customer request for a price, identified only by a label the florist chooses. Tangkay never stores customer names or numbers.
_Avoid_: Customer, order, chat

**Quote**:
A priced recipe for one inquiry, with a reply the florist can send. It starts as a draft when the photo is uploaded.
_Avoid_: Estimate, order, invoice

**Draft quote**:
A quote the florist is still editing; its reply has not been copied yet.

**Sent quote**:
A quote whose reply the florist has copied to send. Copying stamps the sent time.
_Avoid_: Finished, submitted

**Open quote**:
A sent quote whose valid-until date has not passed. Open quotes are the ones the margin alarm watches.
_Avoid_: Active, pending

**Expired quote**:
A sent quote whose valid-until date has passed.

**Valid until**:
The date up to which a quoted price holds. Defaults to two days after sending; the florist can change it per quote.
_Avoid_: Expiry, deadline

**Underwater quote**:
An open quote whose margin, recomputed at the latest costs, has fallen below the shop's minimum margin.
_Avoid_: Losing quote, stale quote

**Margin alarm**:
The warning raised when a new receipt turns open quotes underwater, with a drafted price-update message.
_Avoid_: Price alert, notification

**Time-to-quote**:
How long one quote took: from the moment the bouquet photo was uploaded to the moment the reply was copied. Only sent quotes have one.
_Avoid_: Turnaround, response time, TTQ

**Taglish reply**:
The ready-to-send message for a quote, in mixed Tagalog and English, with the price and the valid-until date.
_Avoid_: Response, chat message
