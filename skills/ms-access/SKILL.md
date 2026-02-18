---
name: ms-access
description: >-
  Build and manage Microsoft Access databases, queries, forms, reports, and VBA
  automation. Use when someone asks to "create Access database", "write Access
  queries", "build Access forms", "Access VBA macro", "migrate from Access",
  "Access report", "link Access to SQL Server", or "convert Access to web app".
  Covers table design, relationships, SQL queries, forms, reports, VBA
  automation, and migration strategies to modern platforms.
license: Apache-2.0
compatibility: 'Microsoft Access 2016+, Microsoft 365 Access. Windows only.'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - microsoft-access
    - database
    - vba
    - forms
    - reports
---

# Microsoft Access

## Overview

This skill helps AI agents work with Microsoft Access databases — designing tables, writing queries, building forms and reports, automating with VBA, and planning migrations to modern platforms. Access is widely used in small businesses and departments for data management, and agents should know how to build, maintain, and eventually migrate these systems.

## Instructions

### Step 1: Database Design

```
Table: Customers
  CustomerID    AutoNumber (Primary Key)
  FirstName     Short Text (50)
  LastName      Short Text (50)
  Email         Short Text (100), Indexed (No Duplicates)
  Phone         Short Text (20)
  Company       Short Text (100)
  CreatedDate   Date/Time, Default: =Now()
  IsActive      Yes/No, Default: Yes

Table: Orders
  OrderID       AutoNumber (Primary Key)
  CustomerID    Long Integer (Foreign Key -> Customers)
  OrderDate     Date/Time, Default: =Date()
  TotalAmount   Currency
  Status        Short Text (20), Validation: In ("Pending","Shipped","Delivered","Cancelled")

Table: OrderItems
  ItemID        AutoNumber (Primary Key)
  OrderID       Long Integer (Foreign Key -> Orders)
  ProductID     Long Integer (Foreign Key -> Products)
  Quantity      Integer, Validation: >0
  UnitPrice     Currency

Table: Products
  ProductID     AutoNumber (Primary Key)
  ProductName   Short Text (100)
  Category      Short Text (50)
  UnitPrice     Currency
  UnitsInStock  Integer, Default: 0
  ReorderLevel  Integer, Default: 10

Relationships (enforce referential integrity, cascade update, no cascade delete):
  Customers (1) --- (many) Orders
  Orders (1) --- (many) OrderItems
  Products (1) --- (many) OrderItems
```

Design rules: AutoNumber PKs, proper data types with length limits, validation rules at table level, default values, indexes on frequently queried fields.

### Step 2: Queries

```sql
-- Join with aggregation: total sales per customer
SELECT c.CustomerID, c.FirstName & " " & c.LastName AS FullName,
       Count(o.OrderID) AS OrderCount, Sum(o.TotalAmount) AS TotalSpent
FROM Customers c INNER JOIN Orders o ON c.CustomerID = o.CustomerID
GROUP BY c.CustomerID, c.FirstName & " " & c.LastName
HAVING Sum(o.TotalAmount) > 1000
ORDER BY TotalSpent DESC;

-- Crosstab: monthly sales by category
TRANSFORM Sum(oi.Quantity * oi.UnitPrice) AS Revenue
SELECT p.Category
FROM Products p INNER JOIN OrderItems oi ON p.ProductID = oi.ProductID
INNER JOIN Orders o ON oi.OrderID = o.OrderID
WHERE o.OrderDate Between #2026-01-01# And #2026-12-31#
GROUP BY p.Category
PIVOT Format(o.OrderDate, "yyyy-mm");

-- Inactive customers (no orders in 90 days)
SELECT c.CustomerID, c.FirstName, c.LastName, c.Email
FROM Customers c
WHERE c.CustomerID NOT IN (
    SELECT DISTINCT o.CustomerID FROM Orders o WHERE o.OrderDate >= DateAdd("d", -90, Date())
) AND c.IsActive = True;

-- Action: mark overdue orders
UPDATE Orders SET Status = "Overdue"
WHERE Status = "Pending" AND OrderDate < DateAdd("d", -30, Date());

-- Parameter query
SELECT o.OrderID, c.LastName, o.OrderDate, o.TotalAmount
FROM Orders o INNER JOIN Customers c ON o.CustomerID = c.CustomerID
WHERE o.OrderDate Between [Enter Start Date:] And [Enter End Date:];
```

### Step 3: Forms & VBA

```vba
' Search form with dynamic filtering
Private Sub btnSearch_Click()
    Dim strFilter As String
    If Not IsNull(Me.txtSearchName) Then
        strFilter = "LastName Like '*" & Me.txtSearchName & "*'"
    End If
    If Not IsNull(Me.cboStatus) Then
        If Len(strFilter) > 0 Then strFilter = strFilter & " AND "
        strFilter = strFilter & "Status = '" & Me.cboStatus & "'"
    End If
    Me.subResults.Form.Filter = strFilter
    Me.subResults.Form.FilterOn = (Len(strFilter) > 0)
End Sub

' Validation before save
Private Sub Form_BeforeUpdate(Cancel As Integer)
    If IsNull(Me.txtEmail) Or Not Me.txtEmail Like "*@*.*" Then
        MsgBox "Please enter a valid email address.", vbExclamation
        Me.txtEmail.SetFocus
        Cancel = True
    End If
End Sub
```

### Step 4: Reports & Export

```vba
' Export report to PDF
Private Sub btnExportPDF_Click()
    DoCmd.OutputTo acOutputReport, "rptMonthlySales", acFormatPDF, _
        "C:\Reports\SalesReport_" & Format(Date, "yyyy-mm-dd") & ".pdf"
End Sub

' Export query results to Excel
Public Sub ExportToExcel()
    Dim xlApp As Object, xlWb As Object, rs As DAO.Recordset
    Set xlApp = CreateObject("Excel.Application")
    Set xlWb = xlApp.Workbooks.Add
    Set rs = CurrentDb.OpenRecordset("qryMonthlySales")
    Dim i As Integer
    For i = 0 To rs.Fields.Count - 1
        xlWb.Sheets(1).Cells(1, i + 1).Value = rs.Fields(i).Name
    Next i
    xlWb.Sheets(1).Range("A2").CopyFromRecordset rs
    xlWb.Sheets(1).Columns.AutoFit
    xlWb.SaveAs "C:\Reports\MonthlySales_" & Format(Date, "yyyy-mm") & ".xlsx"
    xlWb.Close: xlApp.Quit
End Sub
```

### Step 5: Automation

```vba
' Import CSV and deduplicate against existing data
Public Sub ImportCSV()
    DoCmd.TransferText acImportDelim, , "ImportedData", "C:\Data\import.csv", True
    CurrentDb.Execute "INSERT INTO Customers (FirstName, LastName, Email) " & _
        "SELECT Trim(FirstName), Trim(LastName), LCase(Trim(Email)) " & _
        "FROM ImportedData WHERE Email NOT IN (SELECT Email FROM Customers)"
    CurrentDb.Execute "DROP TABLE ImportedData"
End Sub

' Link to SQL Server
Public Sub LinkSQLServerTables()
    Dim tdf As DAO.TableDef, connStr As String
    connStr = "ODBC;DRIVER={ODBC Driver 17 for SQL Server};SERVER=myserver.database.windows.net;DATABASE=MyDB;UID=admin;PWD=password;"
    Set tdf = CurrentDb.CreateTableDef("dbo_Customers")
    tdf.Connect = connStr
    tdf.SourceTableName = "dbo.Customers"
    CurrentDb.TableDefs.Append tdf
End Sub
```

### Step 6: Migration Strategy

| Current | Target | Best For |
|---------|--------|----------|
| Access tables | SQL Server / Azure SQL | Data > 2GB, multi-user |
| Access forms | Power Apps | Low-code, mobile access |
| Access reports | Power BI | Advanced analytics |
| Access + VBA | Web app (Node/Python) | Internet access, APIs |
| Everything | Dataverse + Power Platform | Full MS ecosystem |

## Examples

### Example 1: Build an order management database
**User prompt:** "Create an Access database for tracking customer orders with products, order items, and a search form to find orders by customer name or date range."

The agent will:
1. Create four tables (Customers, Orders, OrderItems, Products) with AutoNumber primary keys, proper data types, and validation rules
2. Set up relationships with referential integrity: Customers 1-to-many Orders, Orders 1-to-many OrderItems, Products 1-to-many OrderItems
3. Build a search form with text box for customer name, combo box for status, and date range fields
4. Add VBA `btnSearch_Click` handler that constructs a dynamic filter string and applies it to a subform displaying matching orders

### Example 2: Generate a monthly sales report and export to PDF
**User prompt:** "Create an Access report showing monthly sales totals grouped by product category, with subtotals per category and a grand total, then export it as a PDF."

The agent will:
1. Write a crosstab query using `TRANSFORM Sum(Quantity * UnitPrice)` pivoted by `Format(OrderDate, "yyyy-mm")` and grouped by product category
2. Design a report with Group Header/Footer on Category (showing subtotals), Detail section for monthly figures, and Report Footer for grand total
3. Add conditional formatting in the `GroupFooter_Format` event to highlight categories with sales under $1,000 in red
4. Implement a `btnExportPDF_Click` handler using `DoCmd.OutputTo` to save the report as a dated PDF file

## Guidelines

- Always compact and repair regularly — Access databases bloat over time
- Set the 2GB file size limit warning early — migrate before hitting it
- Split database: front-end (forms/queries) on user's machine, back-end (tables) on network share
- Back up .accdb files daily — no built-in replication or point-in-time recovery
- Use parameterized queries, not string concatenation — SQL injection applies to Access too
- Linked tables to SQL Server for multi-user scenarios (>5 concurrent users)
- Keep VBA in modules, not behind individual forms — easier to maintain and debug
- Error handling in every VBA procedure — `On Error GoTo ErrHandler`
- Document table relationships, validation rules, and VBA in a design document
- Plan migration early — Access is a prototyping tool, not an enterprise platform
